import assert from "node:assert/strict";
import test from "node:test";
import {
    assertProcessingResultMatchesInbound,
    parseProcessingResult,
    processingResultId,
    ProcessingResultPersistenceError,
} from "@/modules/whatsapp/processing-result.service";

const validResult = {
    contractVersion: "wa-akg.result.v1",
    eventId: "evt_1",
    jobId: "job_1",
    correlationId: "cor_1",
    processorVersion: "faster-whisper-worker.v1",
    status: "completed",
    evidence: [{ kind: "audio-transcription", reference: "sha256:abc", status: "observed" }],
    confidence: 0.91,
    sourceReferences: ["sha256:abc"],
    artifacts: [{
        kind: "transcript",
        reference: "inline:transcript",
        mimeType: "text/plain",
        text: "hello",
        language: "en",
        segments: [{ start: 0, end: 1.2, text: "hello" }],
    }],
    accessScope: { subjectId: "user_1", sessionIds: ["session_1"] },
};

test("accepts the worker result contract and keeps structured transcript artifacts", () => {
    const parsed = parseProcessingResult(validResult);
    assert.equal(parsed.contractVersion, "wa-akg.result.v1");
    assert.equal(parsed.artifacts[0]?.text, "hello");
    assert.deepEqual(parsed.accessScope.sessionIds, ["session_1"]);
});

test("rejects results without a non-empty source reference", () => {
    assert.throws(
        () => parseProcessingResult({ ...validResult, sourceReferences: [] }),
        /sourceReferences/,
    );
});

test("derives a stable opaque result id from event and job", () => {
    const first = processingResultId("evt_1", "job_1");
    assert.equal(first, processingResultId("evt_1", "job_1"));
    assert.notEqual(first, processingResultId("evt_1", "job_2"));
    assert.match(first, /^res_[a-f0-9]{64}$/);
});

test("rejects a result whose authorization scope differs from the inbound event", () => {
    const result = parseProcessingResult(validResult);
    assert.throws(
        () => assertProcessingResultMatchesInbound(result, {
            jobId: "job_1",
            payload: {
                contractVersion: "wa-akg.event.v1",
                source: "wa-akg",
                eventId: "evt_1",
                correlationId: "cor_1",
                originalMessageId: "wamid_1",
                event: "message.received",
                type: "message.received",
                sessionId: "session_1",
                timestamp: "2026-10-31T00:00:00.000Z",
                occurredAt: "2026-10-31T00:00:00.000Z",
                modality: "audio",
                status: "received",
                sender: { id: "sender_1" },
                conversation: { id: "chat_1", type: "chat" },
                authorization: { subjectId: "different_user", sessionId: "session_1", scopes: ["webhook:dispatch"] },
                evidenceStatus: "observed",
                data: {},
            },
        }),
        (error: unknown) => error instanceof ProcessingResultPersistenceError && error.statusCode === 409,
    );
});
