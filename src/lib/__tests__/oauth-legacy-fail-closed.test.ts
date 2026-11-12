import test from "node:test";
import assert from "node:assert/strict";
import { hasActiveOAuthGrant } from "../oauth/service";

test("OAuth records without a normalized active grant are never active", () => {
    assert.equal(hasActiveOAuthGrant({ grantId: "grant-1", grant: { revokedAt: null } }), true);
    assert.equal(hasActiveOAuthGrant({ grantId: null, grant: { revokedAt: null } }), false);
    assert.equal(hasActiveOAuthGrant({ grantId: "grant-1", grant: null }), false);
    assert.equal(hasActiveOAuthGrant({ grantId: "grant-1", grant: { revokedAt: new Date() } }), false);
    assert.equal(hasActiveOAuthGrant(null), false);
});
