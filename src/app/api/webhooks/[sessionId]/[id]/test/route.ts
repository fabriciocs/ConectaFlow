import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { webhookScopedWhere } from "@/lib/webhook-access";
import { testWebhook } from "@/lib/webhook";
import { revealWebhookRequestHeaders } from "@/lib/webhook-headers";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; id: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, id } = await params;

    const session = await getAuthorizedSession(user, request, sessionId);
    if (!session) {
        return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
    }

        // Verify webhook access
    const webhook = await prisma.webhook.findFirst({
        where: webhookScopedWhere(session, user.id, id)
    });

    if (!webhook) {
        return NextResponse.json({ status: false, message: "Webhook not found", error: "Webhook not found" }, { status: 404 });
    }

    const result = await testWebhook(webhook.id, webhook.url, webhook.secret, {
        allowLocal: webhook.allowLocal,
        tenantId: session.tenantId,
        requestHeaders: revealWebhookRequestHeaders(webhook.requestHeaders)
    });

    return NextResponse.json({
        status: true,
        message: result.success ? "Webhook test successful" : "Webhook test failed",
        data: result
    });
}
