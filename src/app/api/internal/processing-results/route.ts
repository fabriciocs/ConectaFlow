import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { verifySharedToken, verifyWebhookSignature } from "@/lib/webhook-signature";
import {
    persistProcessingResult,
    ProcessingResultPersistenceError,
} from "@/modules/whatsapp/processing-result.service";

const MAX_RESULT_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESULT_BODY_BYTES) {
        return NextResponse.json({ status: false, error: "Processing result is too large" }, { status: 413 });
    }

    const secret = process.env.WA_AKG_RESULT_WEBHOOK_SECRET?.trim();
    const sharedToken = process.env.WA_AKG_RESULT_WEBHOOK_TOKEN?.trim();
    const signature = request.headers.get("x-webhook-signature");
    const suppliedToken = request.headers.get("x-wa-akg-result-token");
    const authenticatedBySignature = Boolean(secret && verifyWebhookSignature(secret, body, signature));
    const authenticatedByToken = Boolean(sharedToken && verifySharedToken(sharedToken, suppliedToken));
    if (!authenticatedBySignature && !authenticatedByToken) {
        return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    }

    let input: unknown;
    try {
        input = JSON.parse(body);
    } catch {
        return NextResponse.json({ status: false, error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const persisted = await persistProcessingResult(input);
        return NextResponse.json({
            status: true,
            resultId: persisted.result.resultId,
            eventId: persisted.result.eventId,
            jobId: persisted.result.jobId,
            processingStatus: persisted.result.status,
        }, { status: 200 });
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json({ status: false, error: "Processing result contract is invalid" }, { status: 400 });
        }
        if (error instanceof ProcessingResultPersistenceError) {
            return NextResponse.json({ status: false, error: error.message }, { status: error.statusCode });
        }
        console.error("Processing result persistence error", error instanceof Error ? error.message : "unknown error");
        return NextResponse.json({ status: false, error: "Failed to persist processing result" }, { status: 500 });
    }
}
