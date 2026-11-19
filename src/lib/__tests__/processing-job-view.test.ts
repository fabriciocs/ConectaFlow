import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessingJobView } from "@/lib/processing-job-view";

const receivedAt = new Date("2026-10-31T12:00:00.000Z");

test("projects a processing job without exposing the raw payload or media path", () => {
    const view = buildProcessingJobView({
        eventId: "evt_1",
        jobId: "job_1",
        status: "COMPLETED",
        attempts: 1,
        receivedAt,
        processedAt: new Date("2026-10-31T12:01:00.000Z"),
        lastError: null,
        mediaRef: "C:/private/media/secret.ogg",
        payload: {
            contractVersion: "wa-akg.event.v1",
            source: "wa-akg",
            eventId: "evt_1",
            correlationId: "corr_1",
            originalMessageId: "wamid_1",
            event: "message.received",
            type: "message.received",
            sessionId: "session_public_1",
            timestamp: "2026-10-31T12:00:00.000Z",
            occurredAt: "2026-10-31T12:00:00.000Z",
            modality: "audio",
            status: "received",
            sender: { id: "sender_1" },
            conversation: { id: "chat_1", type: "chat" },
            authorization: { subjectId: "user_1", sessionId: "session_public_1", scopes: ["webhook:dispatch"] },
            evidenceStatus: "observed",
            data: { secretPayload: "must-not-be-returned" },
        },
        result: {
            resultId: "res_1",
            eventId: "evt_1",
            jobId: "job_1",
            correlationId: "corr_1",
            contractVersion: "wa-akg.result.v1",
            status: "COMPLETED",
            processorVersion: "worker.test",
            modality: "audio",
            language: "pt",
            text: "texto",
            evidence: [{ kind: "transcript", reference: "artifact_1", status: "observed" }],
            confidence: 0.9,
            sourceReferences: ["media:evt_1"],
            artifacts: [{ kind: "transcript", reference: "artifact_1", text: "texto" }],
            failureReason: null,
            createdAt: receivedAt,
            updatedAt: receivedAt,
        },
    });

    assert.equal(view.modality, "audio");
    assert.equal(view.originalMessageId, "wamid_1");
    assert.equal(view.hasMediaReference, true);
    assert.equal(view.result?.text, "texto");
    assert.equal("data" in view, false);
    assert.equal("mediaRef" in view, false);
});

test("keeps status readable when a legacy payload is not a current envelope", () => {
    const view = buildProcessingJobView({
        eventId: "evt_legacy",
        jobId: "job_legacy",
        status: "FAILED",
        attempts: 2,
        receivedAt,
        processedAt: null,
        lastError: "worker unavailable",
        mediaRef: null,
        payload: { legacy: true },
        result: null,
    });

    assert.equal(view.contractVersion, null);
    assert.equal(view.modality, null);
    assert.equal(view.failureReason, "worker unavailable");
    assert.equal(view.result, null);
});
