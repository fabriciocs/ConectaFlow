import { z } from "zod";

const eventTypes = [
    "message.received",
    "message.sent",
    "message.status",
    "message.edited",
    "message.deleted",
    "connection.update",
    "group.update",
    "group.participant",
    "contact.update",
    "status.update",
    "test",
] as const;

export const inboundWebhookEnvelopeSchema = z.object({
    contractVersion: z.literal("wa-akg.event.v1"),
    source: z.literal("wa-akg"),
    eventId: z.string().min(1).max(191),
    correlationId: z.string().min(1).max(191),
    originalMessageId: z.string().min(1).max(191),
    event: z.enum(eventTypes),
    type: z.enum(eventTypes),
    sessionId: z.string().min(1).max(191),
    timestamp: z.string().datetime({ offset: true }),
    occurredAt: z.string().datetime({ offset: true }),
    modality: z.enum(["audio", "image", "document", "web", "video", "text"]),
    status: z.literal("received"),
    sender: z.object({ id: z.string().min(1).max(255) }).strict(),
    conversation: z.object({
        id: z.string().min(1).max(255),
        type: z.enum(["chat", "group", "status", "unknown"]),
    }).strict(),
    authorization: z.object({
        subjectId: z.string().min(1).max(191),
        sessionId: z.string().min(1).max(191),
        scopes: z.array(z.string().min(1).max(128)).min(1).max(32),
    }).strict(),
    evidenceStatus: z.enum(["observed", "declared", "inferred", "unknown"]),
    data: z.unknown(),
}).strict();

export type InboundWebhookEnvelopeContract = z.infer<typeof inboundWebhookEnvelopeSchema>;
