import assert from "node:assert/strict";
import test from "node:test";
import {
    buildInboundEventIdentity,
    canonicalInboundPayload,
    canonicalizeJson,
    extractOriginalMessageId,
    inferInboundModality,
    stableJsonStringify,
} from "../inbound-event-identity";

test("canonicalizes object key order without changing array order", () => {
    assert.equal(
        stableJsonStringify({ z: 1, nested: { b: 2, a: 1 }, a: ["second", "first"] }),
        '{"a":["second","first"],"nested":{"a":1,"b":2},"z":1}',
    );
    assert.deepEqual(canonicalizeJson({ b: 1, a: 2 }), { a: 2, b: 1 });
});

test("extracts the original message id from supported payload shapes", () => {
    assert.equal(extractOriginalMessageId({ key: { id: "wamid-1" } }), "wamid-1");
    assert.equal(extractOriginalMessageId({ message_id: "wamid-2" }), "wamid-2");
    assert.equal(extractOriginalMessageId({ id: "" }), undefined);
});

test("infers modality from message type and MIME type", () => {
    assert.equal(inferInboundModality({ type: "AUDIO" }), "audio");
    assert.equal(inferInboundModality({ mime_type: "image/jpeg" }), "image");
    assert.equal(inferInboundModality({ type: "VIDEO" }), "video");
    assert.equal(inferInboundModality({ type: "TEXT" }), "text");
});

test("builds deterministic identity for duplicate deliveries", () => {
    const data = { key: { id: "wamid-1" }, type: "AUDIO", content: "" };
    const first = buildInboundEventIdentity("session-1", "message.received", data);
    const second = buildInboundEventIdentity("session-1", "message.received", { content: "", type: "AUDIO", key: { id: "wamid-1" } });

    assert.deepEqual(first, second);
    assert.match(first.eventId, /^evt_[a-f0-9]{48}$/);
    assert.match(first.correlationId, /^corr_[a-f0-9]{64}$/);
    assert.equal(first.originalMessageId, "wamid-1");
    assert.equal(first.modality, "audio");
});

test("separates changed payloads that reuse a message id", () => {
    const first = buildInboundEventIdentity("session-1", "message.received", { key: { id: "wamid-1" }, content: "a" });
    const second = buildInboundEventIdentity("session-1", "message.received", { key: { id: "wamid-1" }, content: "b" });

    assert.equal(first.originalMessageId, second.originalMessageId);
    assert.notEqual(first.payloadHash, second.payloadHash);
    assert.notEqual(first.idempotencyKey, second.idempotencyKey);
    assert.notEqual(first.eventId, second.eventId);
});

test("gives distinct group updates content-based event identities", () => {
    const firstData = { id: "group@g.us", subject: "Before" };
    const changedData = { id: "group@g.us", subject: "After" };
    const first = buildInboundEventIdentity("session-1", "group.update", firstData);
    const changed = buildInboundEventIdentity("session-1", "group.update", changedData);
    const duplicate = buildInboundEventIdentity("session-1", "group.update", { subject: "Before", id: "group@g.us" });

    assert.notEqual(first.originalMessageId, changed.originalMessageId);
    assert.notEqual(first.eventId, changed.eventId);
    assert.deepEqual(first, duplicate);
});

test("ignores transport timestamps and generated media URLs in the payload hash", () => {
    const first = buildInboundEventIdentity("session-1", "message.received", {
        key: { id: "wamid-1" },
        content: "hello",
        timestamp: "2026-01-01T00:00:00.000Z",
        fileUrl: "/api/media/first.mp3",
    });
    const second = buildInboundEventIdentity("session-1", "message.received", {
        key: { id: "wamid-1" },
        content: "hello",
        timestamp: "2026-01-02T00:00:00.000Z",
        fileUrl: "/api/media/second.mp3",
    });

    assert.deepEqual(canonicalInboundPayload({ timestamp: "x", value: 1 }), { value: 1 });
    assert.equal(first.payloadHash, second.payloadHash);
    assert.equal(first.eventId, second.eventId);
});

test("uses a content-derived fallback when an event has no message id", () => {
    const identity = buildInboundEventIdentity("session-1", "connection.update", { status: "open" });

    assert.match(identity.originalMessageId, /^connection\.update:[a-f0-9]{32}$/);
    assert.equal(identity.modality, "text");
});
