import { inboundWebhookEnvelopeSchema } from "@/lib/inbound-event-contract";

type ProcessingJobResultView = {
    resultId: string;
    eventId: string;
    jobId: string;
    correlationId: string;
    contractVersion: string;
    status: string;
    processorVersion: string;
    modality: string;
    language: string | null;
    text: string | null;
    evidence: unknown;
    confidence: number | null;
    sourceReferences: unknown;
    artifacts: unknown;
    failureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ProcessingJobViewInput = {
    eventId: string;
    jobId: string | null;
    status: string;
    attempts: number;
    receivedAt: Date;
    processedAt: Date | null;
    lastError: string | null;
    mediaRef: string | null;
    payload: unknown;
    result: ProcessingJobResultView | null;
};

export function buildProcessingJobView(event: ProcessingJobViewInput) {
    const envelope = inboundWebhookEnvelopeSchema.safeParse(event.payload);

    return {
        eventId: event.eventId,
        jobId: event.jobId,
        status: event.status,
        attempts: event.attempts,
        receivedAt: event.receivedAt,
        processedAt: event.processedAt,
        failureReason: event.lastError,
        modality: envelope.success ? envelope.data.modality : null,
        contractVersion: envelope.success ? envelope.data.contractVersion : null,
        originalMessageId: envelope.success ? envelope.data.originalMessageId : null,
        hasMediaReference: Boolean(event.mediaRef),
        result: event.result
            ? {
                resultId: event.result.resultId,
                eventId: event.result.eventId,
                jobId: event.result.jobId,
                correlationId: event.result.correlationId,
                contractVersion: event.result.contractVersion,
                status: event.result.status,
                processorVersion: event.result.processorVersion,
                modality: event.result.modality,
                language: event.result.language,
                text: event.result.text,
                evidence: event.result.evidence,
                confidence: event.result.confidence,
                sourceReferences: event.result.sourceReferences,
                artifacts: event.result.artifacts,
                failureReason: event.result.failureReason,
                createdAt: event.result.createdAt,
                updatedAt: event.result.updatedAt,
            }
            : null,
    };
}
