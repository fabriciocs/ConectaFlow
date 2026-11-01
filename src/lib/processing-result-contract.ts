import { z } from "zod";

const evidenceStatus = z.enum(["observed", "declared", "inferred", "unknown"]);

const segmentSchema = z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().min(0),
    text: z.string(),
}).strict();

const evidenceSchema = z.object({
    kind: z.string().min(1).max(128),
    reference: z.string().min(1).max(1024),
    status: evidenceStatus,
}).strict();

const artifactSchema = z.object({
    kind: z.string().min(1).max(128),
    reference: z.string().min(1).max(1024),
    mimeType: z.string().max(255).optional(),
    text: z.string().max(10 * 1024 * 1024).optional(),
    language: z.string().max(32).nullable().optional(),
    segments: z.array(segmentSchema).optional(),
}).strict();

export const processingResultSchema = z.object({
    contractVersion: z.literal("wa-akg.result.v1"),
    eventId: z.string().min(1).max(191),
    jobId: z.string().min(1).max(191),
    correlationId: z.string().min(1).max(191),
    processorVersion: z.string().min(1).max(128),
    status: z.enum(["completed", "partial", "failed", "blocked"]),
    evidence: z.array(evidenceSchema).max(128),
    confidence: z.number().finite().min(0).max(1).nullable(),
    sourceReferences: z.array(z.string().min(1).max(1024)).min(1).max(128),
    artifacts: z.array(artifactSchema).max(128),
    accessScope: z.object({
        subjectId: z.string().min(1).max(191),
        sessionIds: z.array(z.string().min(1).max(191)).min(1).max(64),
    }).strict(),
    createdAt: z.string().datetime({ offset: true }).optional(),
    failureReason: z.string().max(2000).nullable().optional(),
}).strict();

export type ProcessingResultContract = z.infer<typeof processingResultSchema>;
