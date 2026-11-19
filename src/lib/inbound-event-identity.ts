import { createHash } from "node:crypto";

export type InboundModality = "audio" | "image" | "document" | "web" | "video" | "text";

export interface InboundEventIdentity {
    eventId: string;
    correlationId: string;
    originalMessageId: string;
    payloadHash: string;
    idempotencyKey: string;
    modality: InboundModality;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Return a JSON-compatible value with object keys sorted recursively.
 * Arrays retain their original order because message payload order is meaningful.
 */
export function canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalizeJson);
    if (!isRecord(value)) return value;

    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, canonicalizeJson(value[key])]),
    );
}

export function stableJsonStringify(value: unknown): string {
    return JSON.stringify(canonicalizeJson(value));
}

const VOLATILE_KEYS = new Set([
    "timestamp",
    "receivedAt",
    "received_at",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "downloadedAt",
    "downloaded_at",
    "transcribedAt",
    "transcribed_at",
    "fileUrl",
    "file_url",
]);

function removeVolatileFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(removeVolatileFields);
    if (!isRecord(value)) return value;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !VOLATILE_KEYS.has(key))
            .map(([key, child]) => [key, removeVolatileFields(child)]),
    );
}

export function canonicalInboundPayload(value: unknown): unknown {
    return canonicalizeJson(removeVolatileFields(value));
}

export function sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

/** Extract the current WA-AKG/WhatsApp message id from known payload shapes. */
export function extractOriginalMessageId(data: unknown): string | undefined {
    if (!isRecord(data)) return undefined;
    const key = isRecord(data.key) ? data.key : undefined;
    return firstNonEmptyString(
        key?.id,
        data.messageId,
        data.message_id,
        data.wamid,
        data.id,
    );
}

export function inferInboundModality(data: unknown): InboundModality {
    if (!isRecord(data)) return "text";
    const type = firstNonEmptyString(data.type, data.messageType, data.message_type)?.toLowerCase();
    const mimeType = firstNonEmptyString(data.mimeType, data.mime_type)?.toLowerCase();
    const value = `${type ?? ""} ${mimeType ?? ""}`;

    if (value.includes("audio")) return "audio";
    if (value.includes("image")) return "image";
    if (value.includes("video")) return "video";
    if (value.includes("document")) return "document";
    if (value.includes("http") || value.includes("url")) return "web";
    return "text";
}

/**
 * Build stable identifiers from the event source, session and original message.
 * The payload hash is included so a reused message id with changed content is
 * not silently treated as the same event.
 */
export function buildInboundEventIdentity(
    sessionId: string,
    event: string,
    data: unknown,
): InboundEventIdentity {
    const payloadHash = sha256Hex(stableJsonStringify({ data: canonicalInboundPayload(data), event }));
    // `data.id` is not a unique event id for non-message events. For example,
    // Baileys group.update uses the group JID, which stays constant across
    // distinct updates. Message events retain their source message id; other
    // events use their canonical payload so later updates do not collide.
    const sourceMessageId = event.startsWith("message.")
        ? extractOriginalMessageId(data)
        : undefined;
    const originalMessageId = sourceMessageId ?? `${event}:${payloadHash.slice(0, 32)}`;
    const idempotencyKey = sha256Hex(`${sessionId}\u0000${event}\u0000${originalMessageId}\u0000${payloadHash}`);
    const eventId = `evt_${idempotencyKey.slice(0, 48)}`;
    const correlationId = `corr_${idempotencyKey}`;

    return {
        eventId,
        correlationId,
        originalMessageId,
        payloadHash,
        idempotencyKey,
        modality: inferInboundModality(data),
    };
}
