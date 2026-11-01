import assert from "node:assert/strict";
import test from "node:test";
import {
    buildInboundWebhookEnvelope,
    INBOUND_EVENT_MAX_PAYLOAD_BYTES,
    normalizeInboundEventPayload,
    recoverExpiredInboundEvents,
} from "@/modules/whatsapp/inbound-event.service";
import { prisma } from "@/lib/prisma";

function override(target: object, key: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, value });
    return () => descriptor ? Object.defineProperty(target, key, descriptor) : Reflect.deleteProperty(target, key);
}

test("builds a versioned envelope with stable identity and access context", () => {
    const envelope = buildInboundWebhookEnvelope(
        "session-public",
        "user-1",
        "message.received",
        {
            key: { id: "wamid-1", remoteJid: "5511999999999@s.whatsapp.net" },
            senderJid: "5511888888888@s.whatsapp.net",
            chatJid: "5511999999999@s.whatsapp.net",
            type: "AUDIO",
        },
        "2026-10-31T00:00:00.000Z",
    );

    assert.equal(envelope.contractVersion, "wa-akg.event.v1");
    assert.equal(envelope.source, "wa-akg");
    assert.equal(envelope.eventId.startsWith("evt_"), true);
    assert.equal(envelope.originalMessageId, "wamid-1");
    assert.equal(envelope.modality, "audio");
    assert.deepEqual(envelope.authorization, {
        subjectId: "user-1",
        sessionId: "session-public",
        scopes: ["webhook:dispatch"],
    });
});

test("redacts credential-shaped payload keys before persistence", () => {
    const envelope = buildInboundWebhookEnvelope("session-1", "user-1", "message.received", {
        key: { id: "wamid-1" },
        headers: { authorization: "bearer-secret", "x-api-key": "api-secret" },
        content: "hello",
    });
    const normalized = normalizeInboundEventPayload(envelope);

    assert.deepEqual((normalized.data as { headers: unknown }).headers, {
        authorization: "[REDACTED]",
        "x-api-key": "[REDACTED]",
    });
});

test("rejects oversized persisted envelopes", () => {
    const envelope = buildInboundWebhookEnvelope("session-1", "user-1", "message.received", {
        key: { id: "wamid-1" },
        content: "x".repeat(INBOUND_EVENT_MAX_PAYLOAD_BYTES),
    });

    assert.throws(() => normalizeInboundEventPayload(envelope), /exceeds/);
});

test("rejects envelopes that do not satisfy the runtime contract", () => {
    const envelope = buildInboundWebhookEnvelope("session-1", "user-1", "message.received", {
        key: { id: "wamid-1" },
        content: "hello",
    });

    assert.throws(
        () => normalizeInboundEventPayload({ ...envelope, correlationId: "" }),
        /correlationId/,
    );
});

test("requeues expired processing leases in a bounded, race-safe batch", async () => {
    const delegate = prisma.inboundEvent;
    let updateWhere: unknown;
    const restore = [
        override(delegate, "findMany", async (args: { take: number }) => {
            assert.equal(args.take, 1000);
            return [{ eventId: "evt_expired_1" }, { eventId: "evt_expired_2" }];
        }),
        override(delegate, "updateMany", async (args: { where: unknown; data: { status: string; claimToken: null; claimExpiresAt: null } }) => {
            updateWhere = args.where;
            assert.equal(args.data.status, "QUEUED");
            assert.equal(args.data.claimToken, null);
            assert.equal(args.data.claimExpiresAt, null);
            return { count: 2 };
        }),
    ];
    try {
        assert.equal(await recoverExpiredInboundEvents(5000), 2);
        assert.deepEqual((updateWhere as { eventId: unknown }).eventId, {
            in: ["evt_expired_1", "evt_expired_2"],
        });
        assert.equal((updateWhere as { status: string }).status, "PROCESSING");
        assert.ok((updateWhere as { claimExpiresAt: { lt: unknown } }).claimExpiresAt.lt instanceof Date);
    } finally {
        for (const restoreOne of restore.reverse()) restoreOne();
    }
});
