import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { webhookScopedWhere } from "@/lib/webhook-access";
import { sanitizeWebhookLog } from "@/lib/webhook-redaction";
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; id: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

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

    try {
        const [logs, total] = await Promise.all([
            prisma.webhookLog.findMany({
                where: { webhookId: id, tenantId: session.tenantId },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset
            }),
            prisma.webhookLog.count({
                where: { webhookId: id, tenantId: session.tenantId }
            })
        ]);

        return NextResponse.json({
            status: true,
            data: logs.map(sanitizeWebhookLog),
            total,
            limit,
            offset
        });
    } catch (error) {
        console.error("Fetch webhook logs error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch webhook logs", error: "Failed to fetch webhook logs" }, { status: 500 });
    }
}
