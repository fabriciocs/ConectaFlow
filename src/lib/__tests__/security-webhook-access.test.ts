import assert from "node:assert/strict";
import test from "node:test";
import { serializeAuthorizedWebhook, webhookScopedWhere } from "../webhook-access";

const sessionA = { id: "session-a", tenantId: "tenant-a" };
const owner = "same-user-in-both-tenants";

test("webhook lookup and mutation predicate require tenant, owner, session and id", () => {
  const where = webhookScopedWhere(sessionA, owner, "known-foreign-id");
  assert.deepEqual(where, {
    id: "known-foreign-id",
    tenantId: "tenant-a",
    userId: owner,
    OR: [{ sessionId: "session-a" }, { sessionId: null }],
  });
  assert.notEqual(where.tenantId, "tenant-b");
  assert.notEqual(where.tenantId, null);
  assert.notEqual(where.userId, "other-user");
  assert.deepEqual(webhookScopedWhere(sessionA, owner).OR, where.OR);
});

test("webhook predicate refuses missing tenant/session/owner", () => {
  assert.throws(() => webhookScopedWhere({ id: "s", tenantId: "" }, owner));
  assert.throws(() => webhookScopedWhere({ id: "", tenantId: "tenant-a" }, owner));
  assert.throws(() => webhookScopedWhere(sessionA, ""));
});

test("API-key and OAuth responses never reveal existing webhook header or HMAC secrets", () => {
  const secretMarker = "SECRET_HEADER_MARKER_20261106";
  const row = {
    id: "webhook-a", tenantId: "tenant-a", userId: owner, sessionId: null,
    url: "https://example.invalid/callback?access_token=URL_MARKER",
    requestHeaders: "Authorization: Bearer " + secretMarker,
    secret: "HMAC_SECRET_MARKER",
    name: "fixture", isActive: true,
  };
  for (const authMethod of ["apiKey", "oauth"] as const) {
    const serialized = serializeAuthorizedWebhook(row, authMethod);
    const json = JSON.stringify(serialized);
    assert.equal("requestHeaders" in serialized, false);
    assert.equal("secret" in serialized, false);
    assert.equal(json.includes(secretMarker), false);
    assert.equal(json.includes("HMAC_SECRET_MARKER"), false);
    assert.equal(json.includes("URL_MARKER"), false);
    assert.equal(serialized.tenantId, "tenant-a");
  }
  const browser = serializeAuthorizedWebhook(row, "session");
  assert.ok("requestHeaders" in browser && browser.requestHeaders?.includes(secretMarker));
  assert.equal("secret" in browser, false);
});
