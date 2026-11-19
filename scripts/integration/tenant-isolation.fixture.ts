import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as sessionsGet } from "../../src/app/api/sessions/route";
import { GET as sessionGet } from "../../src/app/api/sessions/[sessionId]/route";
import { GET as mediaGet } from "../../src/app/api/media/[filename]/route";
import { GET as qrGet } from "../../src/app/api/sessions/[sessionId]/qr/route";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, createAuthorizationRequest, bindAuthorizationRequest, approveAuthorizationRequest, exchangeAuthorizationCode, authenticateAccessToken } from "../../src/lib/oauth";
import { prisma } from "../../src/lib/prisma";
import { getAuthorizedSession, getAccessibleSessions } from "../../src/lib/session-access";
import type { TenantIdentity } from "../../src/lib/tenancy/context";
import { provisionManagedApiKey, revokeManagedApiKey, validateApiKeyValue } from "../../src/lib/tenant-api-keys";

// Explicitly refuse an unisolated or real DATABASE_URL.
const sandboxUrl = new URL(process.env.DATABASE_URL ?? "mysql://localhost/");
const dockerFixture = sandboxUrl.pathname === "/wa_akg_sandbox" &&
  process.env.WA_AKG_ISOLATION_CONTAINER?.startsWith("wa-akg-prisma-test-");
const nativeFixture = /^\/wa_akg_sandbox_native_[a-z0-9_]+$/.test(sandboxUrl.pathname) &&
  process.env.WA_AKG_ISOLATION_BACKEND === "native-mysql" &&
  ["127.0.0.1", "localhost"].includes(sandboxUrl.hostname) &&
  (sandboxUrl.port === "" || sandboxUrl.port === "3306");
if (process.env.WA_AKG_SYNTHETIC_ISOLATION !== "1" || !(dockerFixture || nativeFixture)) {
  throw new Error("ISOLATED_DATABASE_REQUIRED");
}
const ta = "fixture-tenant-a", tb = "fixture-tenant-b";
const ua = "fixture-owner-a", uc = "fixture-peer-a", ub = "fixture-owner-b";
const sa = "fixture-wa-a", sc = "fixture-wa-peer", sb = "fixture-wa-b";
const idA = "fixture-db-a";
const actor = (id: string, authMethod: TenantIdentity["authMethod"] = "session", scopes: string[] = [], credentialTenantId?: string): TenantIdentity => ({
  id, role: "USER", authMethod, credentialTenantId,
  ...(authMethod === "oauth" ? { oauthScopes: scopes } : authMethod === "apiKey" ? { tenantScopes: scopes } : {}),
});
const request = (tenant: string, method = "GET") =>
  new Request("https://fixtures.invalid/api/sessions/fixture-wa-a", { method, headers: { "x-tenant-id": tenant } });
const checks: string[] = [];
async function check(name: string, promise: Promise<unknown>, allowed: boolean) {
  assert.equal(Boolean(await promise), allowed, name);
  checks.push(name);
}
async function main() {
  await prisma.tenant.createMany({ data: [
    { id: ta, name: "Synthetic A", slug: "synthetic-a" },
    { id: tb, name: "Synthetic B", slug: "synthetic-b" },
  ] });
  await prisma.user.createMany({ data: [
    { id: ua, email: "a@fixtures.invalid", password: "synthetic-disabled" },
    { id: uc, email: "c@fixtures.invalid", password: "synthetic-disabled" },
    { id: ub, email: "b@fixtures.invalid", password: "synthetic-disabled" },
  ] });
  await prisma.tenantMembership.createMany({ data: [
    { userId: ua, tenantId: ta, role: "OWNER" },
    { userId: uc, tenantId: ta, role: "MEMBER" },
    { userId: ub, tenantId: tb, role: "OWNER" },
  ] });
  await prisma.session.createMany({ data: [
    { id: idA, sessionId: sa, userId: ua, tenantId: ta, name: "Synthetic A" },
    { id: "fixture-db-peer", sessionId: sc, userId: uc, tenantId: ta, name: "Synthetic peer" },
    { id: "fixture-db-b", sessionId: sb, userId: ub, tenantId: tb, name: "Synthetic B" },
  ] });

  const a = actor(ua), peer = actor(uc), b = actor(ub);
  await check("owner A reads own A", getAuthorizedSession(a, request(ta), sa), true);
  await check("peer within A cannot read owner", getAuthorizedSession(peer, request(ta), sa), false);
  await check("B cannot read A", getAuthorizedSession(b, request(tb), sa), false);
  await check("A cannot select B", getAuthorizedSession(a, request(tb), sa), false);
  await check("A resolves own internal ID", getAuthorizedSession(a, request(ta), idA), true);
  assert.deepEqual((await getAccessibleSessions(a, request(ta))).map(s => s.sessionId), [sa]);
  checks.push("A session listing scoped");
  assert.deepEqual((await getAccessibleSessions(b, request(tb))).map(s => s.sessionId), [sb]);
  checks.push("B session listing scoped");

  await check("API read cannot POST", getAuthorizedSession(actor(ua, "apiKey", ["api:read"], ta), request(ta, "POST"), sa), false);
  await check("API read can GET", getAuthorizedSession(actor(ua, "apiKey", ["api:read"], ta), request(ta), sa), true);
  await check("API key cannot switch tenant", getAuthorizedSession(actor(ua, "apiKey", ["api:write"], ta), request(tb, "POST"), sa), false);
  await check("OAuth sessions:read can GET", getAuthorizedSession(actor(ua, "oauth", ["sessions:read"], ta), request(ta), sa), true);
  await check("OAuth sessions:read cannot POST", getAuthorizedSession(actor(ua, "oauth", ["sessions:read"], ta), request(ta, "POST"), sa), false);

  await prisma.session.create({ data: { id: "fixture-collision-db", sessionId: idA, userId: ub, tenantId: tb, name: "Collision" } });
  await check("ambiguous public/internal ID denies", getAuthorizedSession(a, request(ta), idA), false);
  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId: ta, userId: ua } },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await check("revoked member denied", getAuthorizedSession(a, request(ta), sa), false);
  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId: ta, userId: ua } },
    data: { status: "ACTIVE", revokedAt: null },
  });
  await prisma.tenant.update({ where: { id: ta }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
  await check("suspended tenant denied", getAuthorizedSession(a, request(ta), sa), false);

  // Reset synthetic status before credential scenarios; the previous case suspended A.
  await prisma.tenant.update({ where: { id: ta }, data: { status: "ACTIVE", suspendedAt: null } });

  // Verify managed credentials with the same real, disposable database.
  const fresh = await provisionManagedApiKey(ta, ua);
  assert.ok(fresh.apiKey, "first creation returns a secret once");
  const initial = await validateApiKeyValue(fresh.apiKey);
  assert.deepEqual(initial?.tenantScopes, ["api:read", "sessions:read"]);
  checks.push("managed key defaults to read-only");

  // Exercise actual REST route handlers with verified API keys and synthetic tenants.
  const peerKey = await provisionManagedApiKey(ta, uc);
  const otherTenantKey = await provisionManagedApiKey(tb, ub);
  assert.ok(peerKey.apiKey && otherTenantKey.apiKey);
  await prisma.session.update({ where: { id: idA }, data: {
    qr: "synthetic-pairing-secret", config: { apiKey: "synthetic-config-secret" },
  } });
  const authenticatedRequest = (endpoint: string, key: string, tenant: string) =>
    new NextRequest("http://127.0.0.1:43000" + endpoint, {
      headers: { "x-api-key": key, "x-tenant-id": tenant },
    });
  const listResponse = await sessionsGet(authenticatedRequest("/api/sessions", fresh.apiKey, ta));
  assert.equal(listResponse.status, 200, "API key can list only owned sessions");
  const listed = (await listResponse.json()).data;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sessionId, sa);
  assert.equal(Object.hasOwn(listed[0], "qr"), false);
  assert.equal(Object.hasOwn(listed[0], "config"), false);
  checks.push("REST collection isolates owner and redacts pairing secrets");

  const own = await sessionGet(authenticatedRequest("/api/sessions/" + sa, fresh.apiKey, ta),
    { params: Promise.resolve({ sessionId: sa }) });
  assert.equal(own.status, 200);
  const ownPayload = (await own.json()).data;
  assert.equal(Object.hasOwn(ownPayload, "qr"), false);
  assert.equal(Object.hasOwn(ownPayload, "config"), false);
  assert.equal(ownPayload.pairingCode, null);
  checks.push("REST single session redacts API key pairing credentials");

  const peerRead = await sessionGet(authenticatedRequest("/api/sessions/" + sa, peerKey.apiKey, ta),
    { params: Promise.resolve({ sessionId: sa }) });
  assert.equal(peerRead.status, 403);
  checks.push("REST same-tenant peer IDOR rejected");
  const crossTenantRead = await sessionGet(authenticatedRequest("/api/sessions/" + sa, otherTenantKey.apiKey, tb),
    { params: Promise.resolve({ sessionId: sa }) });
  assert.equal(crossTenantRead.status, 403);
  checks.push("REST cross-tenant session IDOR rejected");
  const spoofTenant = await sessionsGet(authenticatedRequest("/api/sessions", fresh.apiKey, tb));
  assert.equal(spoofTenant.status, 401);
  checks.push("REST tenant-header spoof denied");

  // Media filename is public-looking, but authorization must be based on DB ownership.
  const mediaKey = "fixture-media-" + randomBytes(6).toString("hex");
  const filename = sa + "-" + mediaKey + ".jpg";
  const mediaDir = path.resolve(process.cwd(), "data", "media");
  const mediaFile = path.join(mediaDir, filename);
  const mediaBytes = randomBytes(32);
  await prisma.message.create({ data: {
    tenantId: ta, sessionId: idA, remoteJid: "synthetic@fixtures.invalid",
    fromMe: false, keyId: mediaKey, mediaUrl: "/api/media/" + filename,
  } });
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(mediaFile, mediaBytes, { flag: "wx" });
  try {
    const mediaReq = (key: string, tenant: string) =>
      authenticatedRequest("/api/media/" + filename, key, tenant);
    const allowedMedia = await mediaGet(mediaReq(fresh.apiKey, ta),
      { params: Promise.resolve({ filename }) });
    assert.equal(allowedMedia.status, 200);
    assert.deepEqual(Buffer.from(await allowedMedia.arrayBuffer()), mediaBytes);
    checks.push("REST media owner can read synthetic file");

    const peerMedia = await mediaGet(mediaReq(peerKey.apiKey, ta), { params: Promise.resolve({ filename }) });
    assert.equal(peerMedia.status, 404);
    checks.push("REST media same-tenant peer denied");

    const crossMedia = await mediaGet(mediaReq(otherTenantKey.apiKey, tb), { params: Promise.resolve({ filename }) });
    assert.equal(crossMedia.status, 404);
    checks.push("REST media cross-tenant request denied");
  } finally {
    if (existsSync(mediaFile) && readFileSync(mediaFile).equals(mediaBytes)) unlinkSync(mediaFile);
    assert.equal(existsSync(mediaFile), false, "synthetic media must be cleaned");
  }

  // Simulate a separately approved grant, then rotate: scopes must not grow.
  await prisma.apiCredential.updateMany({ where: { tenantId: ta, userId: ua, revokedAt: null },
    data: { scopes: ["api:read", "api:write", "sessions:read"] } });
  const rotated = await provisionManagedApiKey(ta, ua, true);
  assert.ok(rotated.apiKey && rotated.apiKey !== fresh.apiKey);
  assert.equal(await validateApiKeyValue(fresh.apiKey), null);
  const authorized = await validateApiKeyValue(rotated.apiKey);
  assert.deepEqual(authorized?.tenantScopes, ["api:read", "api:write", "sessions:read"]);
  checks.push("rotation preserves explicitly approved scopes, invalidates old key");

  // Revoking and reissuing cannot silently restore write permissions.
  await revokeManagedApiKey(ta, ua);
  assert.equal(await validateApiKeyValue(rotated.apiKey), null);
  const reissued = await provisionManagedApiKey(ta, ua, true);
  assert.ok(reissued.apiKey);
  assert.deepEqual((await validateApiKeyValue(reissued.apiKey))?.tenantScopes, ["api:read", "sessions:read"]);
  checks.push("revoked elevated key reissues read-only");

  // The key becomes unusable immediately when the account is unverified.
  await prisma.user.update({ where: { id: ua }, data: { emailVerified: false } });
  assert.equal(await validateApiKeyValue(reissued.apiKey), null);
  checks.push("unverified email disables API-key authentication");
  await prisma.user.update({ where: { id: ua }, data: { emailVerified: true } });

  // Complete the OAuth authorization-code + PKCE core using synthetic state.
  const callback = "https://client.fixtures.invalid/oauth/callback";
  const { client } = await createClient({
    name: "Synthetic Client", redirectUris: [callback],
    allowedScopes: ["api:read", "sessions:read"],
    grantTypes: ["authorization_code", "refresh_token"],
    isConfidential: false, createdById: ua, tenantId: ta,
  });
  const verifier = "V".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const requestId = await createAuthorizationRequest({
    client, redirectUri: callback, scope: ["api:read", "sessions:read"],
    state: "synthetic-state", codeChallenge: challenge,
  });
  assert.equal(await bindAuthorizationRequest(requestId, ub, tb), null);
  checks.push("OAuth authorization request denies client tenant mismatch");
  assert.ok(await bindAuthorizationRequest(requestId, ua, ta));
  await assert.rejects(() => approveAuthorizationRequest(requestId, ua, ["fixture-db-peer"]));
  checks.push("OAuth grant excludes peer-owned session in same tenant");
  const approved = await approveAuthorizationRequest(requestId, ua, [idA]);
  assert.equal(approved.redirectUri, callback);
  assert.equal(approved.state, "synthetic-state");
  checks.push("OAuth consent binds owner and session");

  await assert.rejects(() => exchangeAuthorizationCode({
    code: approved.code, clientId: client.clientId,
    redirectUri: callback, codeVerifier: "W".repeat(43),
  }));
  checks.push("OAuth PKCE mismatch fails before consuming code");

  const tokens = await exchangeAuthorizationCode({
    code: approved.code, clientId: client.clientId,
    redirectUri: callback, codeVerifier: verifier,
  });
  assert.ok(tokens.accessToken && tokens.refreshToken);
  await assert.rejects(() => exchangeAuthorizationCode({
    code: approved.code, clientId: client.clientId,
    redirectUri: callback, codeVerifier: verifier,
  }));
  checks.push("OAuth PKCE exchange single use");

  const principal = await authenticateAccessToken(tokens.accessToken);
  assert.equal(principal?.credentialTenantId, ta);
  assert.equal(principal?.userId, ua);
  checks.push("OAuth issued token bound to tenant and owner");

  const oauthRequest = (endpoint: string, tenant: string) =>
    new NextRequest("http://127.0.0.1:43000" + endpoint, {
      headers: { authorization: "Bearer " + tokens.accessToken, "x-tenant-id": tenant },
    });
  const oauthList = await sessionsGet(oauthRequest("/api/sessions", ta));
  assert.equal(oauthList.status, 200);
  const oauthRecords = (await oauthList.json()).data;
  assert.equal(oauthRecords.length, 1);
  assert.equal(oauthRecords[0].sessionId, sa);
  assert.equal(Object.hasOwn(oauthRecords[0], "qr"), false);
  checks.push("OAuth REST session listing filtered and sanitized");
  const oauthDetail = await sessionGet(oauthRequest("/api/sessions/" + sa, ta),
    { params: Promise.resolve({ sessionId: sa }) });
  assert.equal(oauthDetail.status, 200);
  const oauthSession = (await oauthDetail.json()).data;
  assert.equal(Object.hasOwn(oauthSession, "config"), false);
  assert.equal(Object.hasOwn(oauthSession, "qr"), false);
  assert.equal(oauthSession.pairingCode, null);
  checks.push("OAuth REST session details redact secrets");
  const oauthSpoofed = await sessionsGet(oauthRequest("/api/sessions", tb));
  assert.equal(oauthSpoofed.status, 401);
  checks.push("OAuth bearer cannot switch to another tenant");
  const qrResponse = await qrGet(oauthRequest("/api/sessions/" + sa + "/qr", ta),
    { params: Promise.resolve({ sessionId: sa }) });
  assert.equal(qrResponse.status, 403);
  assert.equal(qrResponse.headers.get("cache-control"), "no-store");
  checks.push("OAuth bearer cannot retrieve pairing QR");

  // Revocation timestamp and suspension timestamp are independently decisive.
  await prisma.tenant.update({ where: { id: ta }, data: { status: "ACTIVE", suspendedAt: null } });
  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId: ta, userId: ua } },
    data: { status: "ACTIVE", revokedAt: new Date() },
  });
  await check("revokedAt alone denies membership", getAuthorizedSession(a, request(ta), sa), false);
  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId: ta, userId: ua } },
    data: { revokedAt: null },
  });
  await prisma.tenant.update({ where: { id: ta }, data: { status: "ACTIVE", suspendedAt: new Date() } });
  await check("suspendedAt alone denies membership", getAuthorizedSession(a, request(ta), sa), false);

  console.log(JSON.stringify({ status: "VERIFIED", fixture: "disposable real MySQL", checks: checks.length, names: checks,
    limitations: "Synthetic identities, direct authorization guards; no HTTP login, OAuth callback, Socket.IO, or Baileys side effects" }));
}
main().catch(error => {
  console.error(JSON.stringify({ status: "FAILED", kind: error instanceof Error ? error.name : "unknown",
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "NO_CODE" }));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
