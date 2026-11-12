import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateRandomString, hashToken, validateRedirectUri, verifyCodeChallenge, verifyToken } from "./crypto";
import { formatScope, hasCompatibleScopeSet, isValidScope, parseScopeString } from "./scopes";
import { hasWriteCapability, InvalidSessionCapabilityError, normalizeSessionCapabilities, parseSessionCapabilities, sessionIdsFromCapabilities, type SessionCapabilityMap } from "./grant-capabilities";
import { familyAccessTokenWhere } from "./token-family";
import { OAuthError, type OAuthClientRecord, type OAuthGrantType, type OAuthPrincipal, type SessionCapability, type TokenPair } from "./types";

const AUTH_CODE_TTL_MS = 5 * 60_000;
const AUTH_REQUEST_TTL_MS = 10 * 60_000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

type JsonRecord = Record<string, unknown>;
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const clientRecord = (client: JsonRecord): OAuthClientRecord => ({
  id: String(client.id),
  clientId: String(client.clientId),
  name: String(client.name),
  description: typeof client.description === "string" ? client.description : null,
  redirectUris: stringArray(client.redirectUris),
  allowedScopes: stringArray(client.allowedScopes),
  grantTypes: stringArray(client.grantTypes) as OAuthGrantType[],
  isConfidential: Boolean(client.isConfidential),
  isActive: Boolean(client.isActive),
});

function assertClientSecret(client: JsonRecord, supplied?: string) {
  if (!client.isConfidential) return;
  if (!supplied || !verifyToken(supplied, typeof client.clientSecretHash === "string" ? client.clientSecretHash : null)) {
    throw new OAuthError("Client authentication failed", "invalid_client", 401);
  }
}

function assertGrant(client: JsonRecord, grant: OAuthGrantType) {
  if (!client.isActive) throw new OAuthError("Client is inactive", "invalid_client", 401);
  if (grant === "client_credentials") throw new OAuthError("The client_credentials grant is not supported", "unsupported_grant_type", 400);
  if (!stringArray(client.grantTypes).includes(grant)) throw new OAuthError("Grant type is not allowed for this client", "unauthorized_client", 400);
}

function sessionScopeValue(value: unknown): string[] | null {
  const ids = sessionIdsFromCapabilities(value);
  return ids.length ? ids : null;
}

function sessionCapabilitiesValue(value: unknown): Record<string, SessionCapability> | null {
  const capabilities = parseSessionCapabilities(value);
  return Object.keys(capabilities).length ? capabilities : null;
}

export function hasActiveOAuthGrant(record: {
  grantId?: string | null;
  grant?: { revokedAt: Date | null } | null;
} | null | undefined): boolean {
  return Boolean(record?.grantId && record.grant && !record.grant.revokedAt);
}

function operationAllowlistValue(value: unknown): string[] {
  return stringArray(value).filter((item) => /^[A-Z]+\s+\/.+/.test(item));
}

function operationCapabilitiesForGrant(scopes: string[], capabilities: SessionCapabilityMap): string[] | undefined {
  // OAuth write authority is represented only by the normalized per-session
  // capability. Never serialize a wildcard/process-wide MCP allowlist into a
  // delegated grant.
  void scopes;
  void capabilities;
  return undefined;
}

const SESSION_GRANT_SCOPES = new Set(["api:read", "api:write", "mcp:read", "mcp:write", "sessions:read"]);

function assertSessionGrantScopes(scopes: string[], capabilities: SessionCapabilityMap) {
  if (scopes.some((scope) => SESSION_GRANT_SCOPES.has(scope)) && !Object.keys(capabilities).length) {
    throw new OAuthError("At least one session must be selected", "access_denied", 403);
  }
  if (hasWriteCapability(capabilities) && !scopes.includes("api:write") && !scopes.includes("mcp:write")) {
    throw new OAuthError("WRITE capability requires a write OAuth scope", "invalid_scope", 400);
  }
}

function capabilityMapFromGrant(grant: { sessionCapabilities: Array<{ sessionId: string; capability: string }> } | null | undefined): SessionCapabilityMap {
  if (!grant) return {};
  return Object.fromEntries(
    grant.sessionCapabilities
      .filter((item): item is { sessionId: string; capability: "READ" | "WRITE" } => item.capability === "READ" || item.capability === "WRITE")
      .map((item) => [item.sessionId, item.capability]),
  );
}

async function persistPair(tx: Prisma.TransactionClient, input: {
  clientId: string;
  userId: string | null;
  scope: string;
  sessionScope?: string[] | null;
  sessionCapabilities?: SessionCapabilityMap | null;
  grantId?: string | null;
  operationAllowlist?: string[];
  resource?: string | null;
  grantType: OAuthGrantType;
  familyId?: string;
}): Promise<TokenPair> {
  const now = new Date();
  const familyId = input.familyId ?? generateRandomString(24);
  const accessToken = generateRandomString(32);
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = input.grantType === "client_credentials" ? undefined : generateRandomString(48);

  await tx.oAuthAccessToken.create({
    data: {
      tokenHash: hashToken(accessToken), clientId: input.clientId, userId: input.userId,
      scope: input.scope, grantType: input.grantType, familyId,
      grantId: input.grantId ?? undefined,
      sessionScope: input.sessionCapabilities ?? input.sessionScope ?? undefined,
      operationAllowlist: input.operationAllowlist?.length ? input.operationAllowlist : undefined,
      resource: input.resource ?? undefined, expiresAt,
    },
  });
  if (refreshToken) {
    await tx.oAuthRefreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken), clientId: input.clientId, userId: input.userId,
        scope: input.scope, grantType: input.grantType,
        grantId: input.grantId ?? undefined,
        sessionScope: input.sessionCapabilities ?? input.sessionScope ?? undefined, familyId,
        operationAllowlist: input.operationAllowlist?.length ? input.operationAllowlist : undefined,
        resource: input.resource ?? undefined,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });
  }
  await tx.oAuthClient.update({ where: { clientId: input.clientId }, data: { lastUsedAt: now } });

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scope: input.scope, tokenType: "Bearer" };
}

export async function getClient(clientId: string): Promise<OAuthClientRecord | null> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  return client ? clientRecord(client as unknown as JsonRecord) : null;
}

export async function authenticateOAuthClient(clientId: string, secret?: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError("Client authentication failed", "invalid_client", 401);
  assertClientSecret(client as unknown as JsonRecord, secret);
  if (!client.isActive) throw new OAuthError("Client is inactive", "invalid_client", 401);
  return clientRecord(client as unknown as JsonRecord);
}

export async function createClient(input: {
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: OAuthGrantType[];
  isConfidential: boolean;
  createdById: string | null;
}) {
  const clientId = generateRandomString(24);
  const clientSecret = input.isConfidential ? generateRandomString(48) : undefined;
  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      redirectUris: input.redirectUris,
      allowedScopes: input.allowedScopes,
      grantTypes: input.grantTypes,
      isConfidential: input.isConfidential,
      createdById: input.createdById,
    },
  });
  return { client: clientRecord(client as unknown as JsonRecord), clientSecret };
}

export async function updateClient(clientId: string, input: { isActive?: boolean; name?: string; description?: string }) {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.oAuthClient.updateMany({
      where: { clientId },
      data: {
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.description === undefined ? {} : { description: input.description.trim() || null }),
      },
    });
    if (result.count && input.isActive === false) {
      const now = new Date();
      await tx.oAuthGrant.updateMany({ where: { clientId, revokedAt: null }, data: { revokedAt: now } });
      await tx.oAuthRefreshToken.updateMany({ where: { clientId, revokedAt: null }, data: { revokedAt: now } });
      await tx.oAuthAccessToken.updateMany({ where: { clientId, revokedAt: null }, data: { revokedAt: now } });
      await tx.oAuthAuthorizationRequest.updateMany({ where: { clientId, consumedAt: null }, data: { consumedAt: now } });
      await tx.oAuthAuthorizationCode.updateMany({ where: { clientId, consumedAt: null }, data: { consumedAt: now } });
    }
    return result;
  });
  if (!updated.count) return null;
  return getClient(clientId);
}

export async function createAuthorizationRequest(input: {
  client: OAuthClientRecord;
  redirectUri: string;
  scope: string[];
  state: string;
  codeChallenge: string;
  resource?: string;
}) {
  if (!input.client.isActive) throw new OAuthError("Client is inactive", "unauthorized_client");
  assertGrant(input.client as unknown as JsonRecord, "authorization_code");
  if (!validateRedirectUri(input.redirectUri, input.client.redirectUris)) throw new OAuthError("Invalid redirect_uri", "invalid_request");
  if (!input.state || input.state.length > 2048) throw new OAuthError("A bounded state value is required", "invalid_request");
  // Validate challenge syntax with a valid-length verifier shape before persistence.
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) throw new OAuthError("PKCE S256 is required", "invalid_request");
  const scopes = input.scope;
  if (!scopes.length || scopes.some((scope) => !isValidScope(scope) || !input.client.allowedScopes.includes(scope))) {
    throw new OAuthError("Invalid or unauthorized scope", "invalid_scope");
  }
  if (!hasCompatibleScopeSet(scopes)) throw new OAuthError("MCP access requires its corresponding API scopes", "invalid_scope");
  if (scopes.some((scope) => scope.startsWith("mcp:")) && !input.resource) {
    throw new OAuthError("MCP authorization requires an exact resource", "invalid_target");
  }
  const requestId = generateRandomString(32);
  await prisma.oAuthAuthorizationRequest.create({
    data: {
      requestId, clientId: input.client.clientId, redirectUri: input.redirectUri,
      responseType: "code", scope: formatScope(scopes), state: input.state,
      codeChallenge: input.codeChallenge, codeChallengeMethod: "S256",
      resource: input.resource, expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
    },
  });
  return requestId;
}

export async function getAuthorizationRequest(requestId: string) {
  const request = await prisma.oAuthAuthorizationRequest.findUnique({ where: { requestId }, include: { client: true } });
  if (!request || request.consumedAt || request.expiresAt <= new Date() || !request.client.isActive) return null;
  return { ...request, client: clientRecord(request.client as unknown as JsonRecord) };
}

export async function bindAuthorizationRequest(requestId: string, userId: string) {
  const now = new Date();
  const result = await prisma.oAuthAuthorizationRequest.updateMany({
    where: { requestId, consumedAt: null, expiresAt: { gt: now }, OR: [{ userId: null }, { userId }] },
    data: { userId },
  });
  if (!result.count) return null;
  return getAuthorizationRequest(requestId);
}

export async function approveAuthorizationRequest(
  requestId: string,
  userId: string,
  sessionIds: string[],
  sessionCapabilities?: SessionCapabilityMap,
) {
  const code = generateRandomString(48);
  const now = new Date();
  const request = await prisma.$transaction(async (tx) => {
    const found = await tx.oAuthAuthorizationRequest.findUnique({ where: { requestId }, include: { client: true } });
    if (!found || found.consumedAt || found.expiresAt <= now || !found.client.isActive) throw new OAuthError("Authorization request expired", "invalid_request");
    if (found.userId && found.userId !== userId) throw new OAuthError("Authorization request belongs to another user", "access_denied", 403);
    const scopes = parseScopeString(found.scope);
    const selectedIds = [...new Set(sessionIds.filter(Boolean))];
    let capabilities: SessionCapabilityMap;
    try {
      capabilities = normalizeSessionCapabilities(selectedIds, sessionCapabilities);
    } catch (error) {
      if (error instanceof InvalidSessionCapabilityError) throw new OAuthError(error.message, "invalid_scope", 400);
      throw error;
    }
    assertSessionGrantScopes(scopes, capabilities);
    const operationAllowlist = operationCapabilitiesForGrant(scopes, capabilities);
    const account = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!account) throw new OAuthError("User account not found", "access_denied", 403);
    if (selectedIds.length) {
      const accessible = await tx.session.findMany({
        where: account.role === "SUPERADMIN" ? { id: { in: selectedIds } } : { id: { in: selectedIds }, userId },
        select: { id: true },
      });
      if (accessible.length !== selectedIds.length) throw new OAuthError("One or more selected sessions are not owned by this user", "access_denied", 403);
    }
    const update = await tx.oAuthAuthorizationRequest.updateMany({
      where: { requestId, consumedAt: null, expiresAt: { gt: now } },
      data: { userId, consumedAt: now },
    });
    if (!update.count) throw new OAuthError("Authorization request was already used", "invalid_request");
    const grant = await tx.oAuthGrant.create({
      data: {
        clientId: found.clientId,
        userId,
        scope: found.scope,
        resource: found.resource,
        sessionCapabilities: {
          create: Object.entries(capabilities).map(([sessionId, capability]) => ({ sessionId, capability })),
        },
      },
    });
    await tx.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code), clientId: found.clientId, userId,
        redirectUri: found.redirectUri, scope: found.scope,
        codeChallenge: found.codeChallenge, codeChallengeMethod: "S256",
        resource: found.resource, grantId: grant.id,
        // Compatibility projection for consumers of pre-normalized OAuth rows.
        sessionScope: Object.keys(capabilities).length ? capabilities : undefined,
        operationAllowlist,
        expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
      },
    });
    return found;
  });
  return { code, redirectUri: request.redirectUri, state: request.state };
}

export async function denyAuthorizationRequest(requestId: string, userId: string) {
  const request = await getAuthorizationRequest(requestId);
  if (!request || (request.userId && request.userId !== userId)) throw new OAuthError("Authorization request expired", "invalid_request");
  const consumed = await prisma.oAuthAuthorizationRequest.updateMany({
    where: { requestId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { userId, consumedAt: new Date() },
  });
  if (!consumed.count) throw new OAuthError("Authorization request was already used", "invalid_request");
  return { redirectUri: request.redirectUri, state: request.state };
}

export async function exchangeAuthorizationCode(input: {
  code: string; clientId: string; clientSecret?: string; redirectUri: string; codeVerifier: string;
}) {
  const codeHash = hashToken(input.code);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const authorizationCode = await tx.oAuthAuthorizationCode.findUnique({ where: { codeHash }, include: { client: true, grant: { include: { sessionCapabilities: true } } } });
    if (!authorizationCode || authorizationCode.expiresAt <= now || authorizationCode.consumedAt) throw new OAuthError("Invalid or expired authorization code", "invalid_grant");
    const client = authorizationCode.client as unknown as JsonRecord;
    assertGrant(client, "authorization_code");
    if (authorizationCode.clientId !== input.clientId) throw new OAuthError("Authorization code was issued to another client", "invalid_grant");
    assertClientSecret(client, input.clientSecret);
    if (authorizationCode.redirectUri !== input.redirectUri) throw new OAuthError("redirect_uri does not match", "invalid_grant");
    if (authorizationCode.codeChallengeMethod !== "S256" || !verifyCodeChallenge(input.codeVerifier, authorizationCode.codeChallenge)) {
      throw new OAuthError("PKCE verification failed", "invalid_grant");
    }
    if (!hasActiveOAuthGrant(authorizationCode)) {
      throw new OAuthError("Authorization grant is revoked", "invalid_grant");
    }

    const consumed = await tx.oAuthAuthorizationCode.updateMany({
      where: { codeHash, clientId: input.clientId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (!consumed.count) throw new OAuthError("Authorization code was already used", "invalid_grant");
    return persistPair(tx, {
      clientId: input.clientId, userId: authorizationCode.userId, scope: authorizationCode.scope,
      grantId: authorizationCode.grantId,
      sessionScope: sessionScopeValue(authorizationCode.sessionScope),
      sessionCapabilities: authorizationCode.grant ? capabilityMapFromGrant(authorizationCode.grant) : sessionCapabilitiesValue(authorizationCode.sessionScope),
      resource: authorizationCode.resource,
      operationAllowlist: operationAllowlistValue(authorizationCode.operationAllowlist),
      grantType: "authorization_code",
    });
  });
}

export async function issueClientCredentials(input: { clientId: string; clientSecret?: string; scope: string[] }) {
  void input;
  throw new OAuthError("The client_credentials grant is not supported", "unsupported_grant_type", 400);
}

export async function rotateRefreshToken(input: { clientId: string; clientSecret?: string; token: string }) {
  const tokenHash = hashToken(input.token);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.oAuthRefreshToken.findUnique({ where: { tokenHash }, include: { client: true, grant: { include: { sessionCapabilities: true } } } });
    if (!token || token.clientId !== input.clientId) throw new OAuthError("Invalid refresh token", "invalid_grant");
    const client = token.client as unknown as JsonRecord;
    assertGrant(client, "refresh_token");
    assertClientSecret(client, input.clientSecret);
    if (token.revokedAt || token.expiresAt <= now || !hasActiveOAuthGrant(token)) throw new OAuthError("Invalid refresh token", "invalid_grant");
    if (token.rotatedAt) {
      await tx.oAuthRefreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: now } });
      await tx.oAuthAccessToken.updateMany({ where: familyAccessTokenWhere(token), data: { revokedAt: now } });
      return null;
    }
    const rotated = await tx.oAuthRefreshToken.updateMany({
      where: { tokenHash, clientId: input.clientId, rotatedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { rotatedAt: now, lastUsedAt: now },
    });
    if (!rotated.count) {
      await tx.oAuthRefreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: now } });
      await tx.oAuthAccessToken.updateMany({ where: familyAccessTokenWhere(token), data: { revokedAt: now } });
      return null;
    }
    return persistPair(tx, {
      clientId: input.clientId, userId: token.userId, scope: token.scope,
      grantId: token.grantId,
      sessionScope: sessionScopeValue(token.sessionScope),
      sessionCapabilities: token.grant ? capabilityMapFromGrant(token.grant) : sessionCapabilitiesValue(token.sessionScope),
      resource: token.resource,
      operationAllowlist: operationAllowlistValue(token.operationAllowlist),
      grantType: "refresh_token", familyId: token.familyId,
    });
  });
  if (!result) throw new OAuthError("Refresh token reuse detected; token family revoked", "invalid_grant");
  return result;
}

export async function authenticateAccessToken(token: string): Promise<OAuthPrincipal | null> {
  if (!token || token.length > 4096) return null;
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { client: true, grant: { include: { sessionCapabilities: true } } },
  });
  const now = new Date();
  if (!record || record.expiresAt <= now || record.revokedAt || !record.client.isActive || !hasActiveOAuthGrant(record)) return null;
  const normalizedCapabilities = record.grant ? capabilityMapFromGrant(record.grant) : sessionCapabilitiesValue(record.sessionScope);
  await prisma.oAuthAccessToken.update({ where: { id: record.id }, data: { lastUsedAt: now } });
  return {
    tokenId: record.id,
    clientId: record.clientId,
    userId: record.userId,
    grantId: record.grantId,
    scope: parseScopeString(record.scope),
    sessionScope: sessionScopeValue(record.sessionScope),
    sessionCapabilities: normalizedCapabilities,
    operationAllowlist: operationAllowlistValue(record.operationAllowlist),
    resource: record.resource,
    expiresAt: record.expiresAt,
  };
}

export async function revokeToken(token: string, clientId: string) {
  if (!token || token.length > 4096) return;
  const tokenHash = hashToken(token);
  const now = new Date();
  const refresh = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
  if (refresh) {
    if (refresh.clientId !== clientId) return;
    await prisma.$transaction([
      prisma.oAuthRefreshToken.updateMany({ where: { familyId: refresh.familyId, revokedAt: null }, data: { revokedAt: now } }),
      prisma.oAuthAccessToken.updateMany({ where: familyAccessTokenWhere(refresh), data: { revokedAt: now } }),
    ]);
    return;
  }
  const access = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash } });
  if (!access || access.clientId !== clientId) return;
  const familyId = access.familyId;
  if (familyId === null) {
    await prisma.oAuthAccessToken.updateMany({ where: { tokenHash, clientId, revokedAt: null }, data: { revokedAt: now } });
    return;
  }
  const familyAccess = { ...access, familyId };
  await prisma.$transaction([
    prisma.oAuthRefreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthAccessToken.updateMany({ where: familyAccessTokenWhere(familyAccess), data: { revokedAt: now } }),
  ]);
}

export async function revokeClientGrants(userId: string, clientId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.oAuthGrant.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthRefreshToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthAccessToken.updateMany({ where: { userId, clientId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

export async function listUserGrants(userId: string) {
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId, revokedAt: null },
    include: { client: { select: { name: true } }, sessionCapabilities: { select: { sessionId: true, capability: true } } },
    orderBy: { createdAt: "desc" },
  });
  return grants.map((grant) => ({
    userId: grant.userId,
    clientId: grant.clientId,
    clientName: grant.client.name,
    scope: parseScopeString(grant.scope),
    sessionScope: grant.sessionCapabilities.map((entry) => entry.sessionId),
    sessionCapabilities: Object.fromEntries(grant.sessionCapabilities.map((entry) => [entry.sessionId, entry.capability])),
    createdAt: grant.createdAt,
  }));
}

export async function listAllGrants() {
  const grants = await prisma.oAuthGrant.findMany({
    where: { revokedAt: null },
    include: {
      client: { select: { name: true } },
      user: { select: { email: true } },
      sessionCapabilities: { select: { sessionId: true, capability: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return grants.map((grant) => ({
    userId: grant.userId,
    userEmail: grant.user.email,
    clientId: grant.clientId,
    clientName: grant.client.name,
    scope: parseScopeString(grant.scope),
    sessionScope: grant.sessionCapabilities.map((entry) => entry.sessionId),
    sessionCapabilities: Object.fromEntries(grant.sessionCapabilities.map((entry) => [entry.sessionId, entry.capability])),
    createdAt: grant.createdAt,
  }));
}

export async function introspectToken(token: string, clientId: string, clientSecret?: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError("Client authentication failed", "invalid_client", 401);
  assertClientSecret(client as unknown as JsonRecord, clientSecret);
  const principal = await authenticateAccessToken(token);
  if (!principal || principal.clientId !== clientId) return { active: false };
  return {
    active: true, scope: principal.scope.join(" "), client_id: principal.clientId,
    sub: principal.userId ?? undefined,
    grant_id: principal.grantId ?? undefined,
    session_scope: principal.sessionCapabilities ?? principal.sessionScope ?? undefined,
    exp: Math.floor(principal.expiresAt.getTime() / 1000), token_type: "Bearer",
  };
}
