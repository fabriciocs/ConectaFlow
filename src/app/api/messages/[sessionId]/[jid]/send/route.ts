import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { errorMessage } from "@/lib/error-message";
import { ChatService, WhatsAppSessionUnavailableError } from "@/modules/whatsapp/chat.service";
import { submitIdempotentText } from "@/modules/messaging/outbound-message.service";
import { parseIdempotentTextPayload, validateIdempotencyKey } from "@/modules/messaging/idempotency";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid } = await params;
        const jid = decodeURIComponent(rawJid);
        
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            if (request.signal.aborted) return new Response(null, { status: 499 });
            return NextResponse.json({ status: false, message: "Request body must contain valid JSON", error: "Request body must contain valid JSON" }, { status: 400 });
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json({ status: false, message: "Request body must be a JSON object", error: "Request body must be a JSON object" }, { status: 400 });
        }
        const { message, mentions, quotedMessageId } = body as {
            message?: Record<string, unknown>;
            mentions?: string[];
            quotedMessageId?: string;
        };

        if (!message) {
            return NextResponse.json({ status: false, message: "message is required", error: "message is required" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user, request, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        if (request.headers.has("idempotency-key")) {
            const key = validateIdempotencyKey(request.headers.get("idempotency-key"));
            const payload = parseIdempotentTextPayload(body);
            if (!key) {
                return NextResponse.json({ status: false, error: "Idempotency-Key must contain 1-128 visible ASCII characters" }, { status: 400 });
            }
            if (!payload || jid.length > 255) {
                return NextResponse.json({ status: false, error: "Idempotent sends require a valid text-only payload (message up to 4096 characters)" }, { status: 400 });
            }
            const result = await submitIdempotentText({ userId: user.id, sessionId, jid, key, payload });
            if (result.conflict) {
                return NextResponse.json({ status: false, error: "Idempotency-Key was already used with a different request" }, { status: 409 });
            }
            const statusCode = result.receipt.status === "QUEUED" || result.receipt.status === "PROCESSING" ? 202 : 200;
            const location = "/api/messages/" + encodeURIComponent(sessionId) + "/operations/" + result.receipt.operationId;
            return NextResponse.json({ status: true, data: result.receipt }, { status: statusCode, headers: { Location: location } });
        }

        // Send Message using ChatService
        const result = await ChatService.sendTextMessage(sessionId, jid, message, mentions, quotedMessageId);

        return NextResponse.json({ status: true, message: "Message sent successfully", data: result });
    } catch (error: unknown) {
        const errorMsg = errorMessage(error, "Failed to send message");
        if (error instanceof WhatsAppSessionUnavailableError) {
            return NextResponse.json({ status: false, message: errorMsg, error: errorMsg }, { status: 503 });
        }
        if (!request.signal.aborted) console.error("Send message error:", error);
        return NextResponse.json({ status: false, message: errorMsg, error: errorMsg }, { status: 500 });
    }
}
