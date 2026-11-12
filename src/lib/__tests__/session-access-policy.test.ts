import assert from "node:assert/strict";
import test from "node:test";
import {
    LEGACY_SESSION_ACCESS_POLICY,
    resolveSessionAccessDecision,
} from "../session-access";

test("legacy SessionAccess explicitly denies shared access for ordinary users", () => {
    assert.equal(LEGACY_SESSION_ACCESS_POLICY, "DENY_NON_OWNER");
    assert.equal(resolveSessionAccessDecision("user-a", "USER", "user-b"), "DENIED_LEGACY_SHARED");
    assert.equal(resolveSessionAccessDecision("staff-a", "STAFF", "user-b"), "DENIED_LEGACY_SHARED");
});

test("session policy allows owners and keeps SUPERADMIN global", () => {
    assert.equal(resolveSessionAccessDecision("owner", "USER", "owner"), "OWNER");
    assert.equal(resolveSessionAccessDecision("admin", "SUPERADMIN", "any-owner"), "SUPERADMIN_GLOBAL");
});
