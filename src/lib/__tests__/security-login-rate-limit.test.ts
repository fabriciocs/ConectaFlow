import assert from "node:assert/strict";
import test from "node:test";
import { checkLoginAttemptQuota, type LoginAttemptRateLimiter } from "../login-rate-limit";

const fakeSecret = "test-secret-never-a-production-secret";
const request = new Request("https://example.invalid/login", { method: "POST" });

test("login quota normalizes account identity and never stores plaintext email", async () => {
  const calls: Array<{ namespace: string; identity: string }> = [];
  const limiter: LoginAttemptRateLimiter = async (namespace, identity) => {
    calls.push({ namespace, identity });
    return { allowed: true, retryAfterSeconds: 0 };
  };
  assert.equal(await checkLoginAttemptQuota(" USER@EXAMPLE.ORG ", request, { secret: fakeSecret, limiter }), true);
  assert.equal(await checkLoginAttemptQuota("user@example.org", request, { secret: fakeSecret, limiter }), true);
  const identities = calls.filter(c => c.namespace === "login-identity");
  assert.equal(identities.length, 2);
  assert.equal(identities[0].identity, identities[1].identity);
  assert.equal(identities[0].identity.includes("user@example.org"), false);
  assert.equal(calls.filter(c => c.namespace === "login-origin").length, 2);
});

test("login quota rejects excess attempts and unavailable shared store", async () => {
  const deny: LoginAttemptRateLimiter = async () => ({ allowed: false, retryAfterSeconds: 30 });
  assert.equal(await checkLoginAttemptQuota("valid@example.org", request, { secret: fakeSecret, limiter: deny }), false);
  const failure: LoginAttemptRateLimiter = async () => { throw new Error("shared store unavailable"); };
  assert.equal(await checkLoginAttemptQuota("valid@example.org", request, { secret: fakeSecret, limiter: failure }), false);
  assert.equal(await checkLoginAttemptQuota("valid@example.org", request, { secret: "", limiter: deny }), false);
});

test("login quota preserves independent identity and source budgets", async () => {
  const limiter: LoginAttemptRateLimiter = async (namespace) => ({
    allowed: namespace !== "login-origin", retryAfterSeconds: namespace === "login-origin" ? 40 : 0,
  });
  assert.equal(await checkLoginAttemptQuota("valid@example.org", request, { secret: fakeSecret, limiter }), false);
});
