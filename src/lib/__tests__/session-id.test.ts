import test from "node:test";
import assert from "node:assert/strict";
import { generateSessionId, isValidSessionId } from "../session-id";

test("session identifiers are bounded and room-safe", () => {
    assert.equal(isValidSessionId("sales-01"), true);
    assert.equal(isValidSessionId("session:private:victim"), false);
    assert.equal(isValidSessionId("../secret"), false);
    assert.equal(isValidSessionId("a".repeat(192)), false);
    assert.match(generateSessionId(), /^[a-f0-9]{32}$/);
});
