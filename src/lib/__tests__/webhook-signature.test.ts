import assert from "node:assert/strict";
import test from "node:test";
import { signWebhookBody, verifySharedToken, verifyWebhookSignature } from "@/lib/webhook-signature";

test("signs and verifies an unchanged webhook body", () => {
    const signature = signWebhookBody("test-secret", '{"event":"message.received"}');
    assert.equal(verifyWebhookSignature("test-secret", '{"event":"message.received"}', signature), true);
});

test("rejects missing, malformed, wrong-secret and changed-body signatures", () => {
    const body = '{"event":"message.received"}';
    const signature = signWebhookBody("test-secret", body);

    assert.equal(verifyWebhookSignature("test-secret", body, undefined), false);
    assert.equal(verifyWebhookSignature("test-secret", body, "sha256=bad"), false);
    assert.equal(verifyWebhookSignature("wrong-secret", body, signature), false);
    assert.equal(verifyWebhookSignature("test-secret", `${body} `, signature), false);
});

test("compares the internal result token in constant time", () => {
    assert.equal(verifySharedToken("result-token", "result-token"), true);
    assert.equal(verifySharedToken("result-token", "wrong-token"), false);
    assert.equal(verifySharedToken("result-token", undefined), false);
});
