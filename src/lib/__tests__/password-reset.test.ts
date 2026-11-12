import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import {
  createPasswordResetToken, resetPasswordWithToken, resetTokenUserId, verifyPasswordResetToken,
} from "../password-reset";
import { POST as register } from "../../app/api/auth/register/route";

function override(target: object, key: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  return () => original ? Object.defineProperty(target, key, original) : Reflect.deleteProperty(target, key);
}

test("password recovery token is signed, expires in 30 minutes and is bound to the current password", () => {
  const user = { id: "cuser0123456789012345", password: "hashed-password-v1" };
  const now = Date.now();
  const secret = "test-only-secret-with-32-characters";
  const token = createPasswordResetToken(user, now, secret);
  assert.equal(resetTokenUserId(token), user.id);
  assert.equal(verifyPasswordResetToken(token, user, now, secret), true);
  assert.equal(verifyPasswordResetToken(token, user, now + 30 * 60_000, secret), false);
  assert.equal(verifyPasswordResetToken(token, { ...user, password: "hashed-password-v2" }, now, secret), false);
  assert.equal(verifyPasswordResetToken(token, { ...user, id: "cuser0000000000000000" }, now, secret), false);
  assert.equal(verifyPasswordResetToken(token + "a", user, now, secret), false);
  assert.equal(verifyPasswordResetToken("malformed", user, now, secret), false);
  assert.equal(resetTokenUserId("malformed"), null);
});

test("password reset only changes the password once, via atomic compare-and-swap", async () => {
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-only-secret-with-32-characters";
  const user = { id: "cuser0123456789012345", password: "previous-hash" };
  const resetToken = createPasswordResetToken(user);
  let updated = 0;
  const restore = [
    override(prisma.user, "findUnique", async () => ({ ...user })),
    override(prisma.user, "updateMany", async (args: { where: { password: string }; data: { password: string } }) => {
      if (args.where.password !== user.password) return { count: 0 };
      assert.equal(await bcrypt.compare("new-password", args.data.password), true);
      user.password = args.data.password;
      updated++;
      return { count: 1 };
    }),
  ];
  try {
    assert.equal(await resetPasswordWithToken(resetToken, "new-password"), true);
    assert.equal(await resetPasswordWithToken(resetToken, "another-password"), false);
    assert.equal(updated, 1);
    assert.equal(await resetPasswordWithToken("bad-token", "new-password"), false);
    assert.equal(await resetPasswordWithToken(resetToken, "short"), false);
  } finally {
    for (const undo of restore.reverse()) undo();
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  }
});

function registerRequest(email: string) {
  return new Request("https://example.test/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Example", email, password: "example-password" }),
  });
}

test("registration refuses an existing globally unique email with HTTP 409", async () => {
  const original = process.env.PUBLIC_REGISTRATION;
  process.env.PUBLIC_REGISTRATION = "true";
  const restore = [
    override(prisma.systemConfig, "findUnique", async () => null),
    override(prisma.user, "findUnique", async () => ({ id: "existing-user" })),
  ];
  try {
    const result = await register(registerRequest("  Existing@Example.TEST  "));
    assert.equal(result.status, 409);
    assert.equal((await result.json()).code, "EMAIL_ALREADY_EXISTS");
    assert.equal(result.headers.get("Cache-Control"), "no-store");
  } finally {
    for (const undo of restore.reverse()) undo();
    if (original === undefined) delete process.env.PUBLIC_REGISTRATION;
    else process.env.PUBLIC_REGISTRATION = original;
  }
});

test("registration handles concurrent unique-index collisions without returning success", async () => {
  const original = process.env.PUBLIC_REGISTRATION;
  process.env.PUBLIC_REGISTRATION = "true";
  let lookupCount = 0;
  const restore = [
    override(prisma.systemConfig, "findUnique", async () => null),
    override(prisma.user, "findUnique", async () => (++lookupCount === 1 ? null : { id: "winner-user" })),
    override(prisma, "$transaction", async () => { throw { code: "P2002", meta: { target: ["email"] } }; }),
  ];
  try {
    const result = await register(registerRequest("existing@example.test"));
    assert.equal(result.status, 409);
    assert.equal((await result.json()).code, "EMAIL_ALREADY_EXISTS");
  } finally {
    for (const undo of restore.reverse()) undo();
    if (original === undefined) delete process.env.PUBLIC_REGISTRATION;
    else process.env.PUBLIC_REGISTRATION = original;
  }
});
