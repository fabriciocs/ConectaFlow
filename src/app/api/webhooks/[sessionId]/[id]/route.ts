import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { webhookScopedWhere, serializeAuthorizedWebhook } from "@/lib/webhook-access";
import { getWebhookFilterUpdate } from "@/lib/webhook-filters";

import { validateSafeUrl } from "@/lib/security";
import { protectWebhookRequestHeaders } from "@/lib/webhook-headers";
const privateHeaders = { "Cache-Control": "no-store" };

export async function PUT(
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

    try {
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ status: false, message: "Invalid request body" }, { status: 400 });
        const { name, url, secret, events, isActive } = body;
        const hasAllowLocal = Object.prototype.hasOwnProperty.call(body, "allowLocal");
        if (hasAllowLocal && typeof body.allowLocal !== "boolean") {
            return NextResponse.json({ status: false, message: "allowLocal must be a boolean", error: "allowLocal must be a boolean" }, { status: 400 });
        }

        const hasRequestHeaders = Object.prototype.hasOwnProperty.call(body, "requestHeaders");
        let requestHeaders: string | null = null;
        if (hasRequestHeaders) {
            const rawHeaders = body.requestHeaders;
            if (rawHeaders !== null && typeof rawHeaders !== "string") {
                return NextResponse.json({ status: false, message: "requestHeaders must be multiline text or null", error: "requestHeaders must be multiline text or null" }, { status: 400 });
            }
            if (typeof rawHeaders === "string" && rawHeaders.trim()) {
                try {
                    requestHeaders = protectWebhookRequestHeaders(rawHeaders);
                } catch (error) {
                    return NextResponse.json({ status: false, message: (error as Error).message }, { status: 400 });
                }
            }
        }

        let filterUpdate;
        try { filterUpdate = getWebhookFilterUpdate(body); }
        catch (error) { return NextResponse.json({ status: false, message: (error as Error).message }, { status: 400 }); }

        // Verify ownership and session context
        const existing = await prisma.webhook.findFirst({
            where: webhookScopedWhere(session, user.id, id)
        });

        if (!existing) {
            return NextResponse.json({ status: false, message: "Webhook not found", error: "Webhook not found" }, { status: 404 });
        }

        const effectiveAllowLocal = hasAllowLocal ? body.allowLocal : existing.allowLocal;
        const urlValidation = await validateSafeUrl((url === undefined ? existing.url : url) as string, { allowHttp: true, allowLocal: effectiveAllowLocal });
        if (!urlValidation.valid) {
            return NextResponse.json({ status: false, message: `Invalid webhook URL: ${urlValidation.error}`, error: urlValidation.error }, { status: 400 });
        }

        const changed = await prisma.webhook.updateMany({
            where: webhookScopedWhere(session, user.id, id),
            data: {
                ...(name !== undefined && { name }),
                ...(url !== undefined && { url }),
                ...(hasAllowLocal && { allowLocal: body.allowLocal }),
                ...(hasRequestHeaders && { requestHeaders }),
                ...(secret !== undefined && { secret }),
                ...(events !== undefined && { events }),
                ...(filterUpdate.supplied && { filters: filterUpdate.value ?? Prisma.DbNull }),
                ...(isActive !== undefined && { isActive })
            }
        });

        if (changed.count !== 1) return NextResponse.json({ status: false, message: "Webhook not found" }, { status: 404 });
        const webhook = await prisma.webhook.findFirst({ where: webhookScopedWhere(session, user.id, id) });
        if (!webhook) return NextResponse.json({ status: false, message: "Webhook not found" }, { status: 404 });
        return NextResponse.json(serializeAuthorizedWebhook(webhook, user.authMethod), { headers: privateHeaders });
    } catch {
        console.error("Update webhook error");
        return NextResponse.json({ status: false, message: "Failed to update webhook", error: "Failed to update webhook" }, { status: 500 });
    }
}

export async function DELETE(
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

    try {

        const existing = await prisma.webhook.findFirst({
            where: webhookScopedWhere(session, user.id, id)
        });

        if (!existing) {
            return NextResponse.json({ status: false, message: "Webhook not found", error: "Webhook not found" }, { status: 404 });
        }

        const deleted = await prisma.webhook.deleteMany({ where: webhookScopedWhere(session, user.id, id) });
        if (deleted.count !== 1) return NextResponse.json({ status: false, message: "Webhook not found" }, { status: 404 });

        return NextResponse.json({ status: true, message: "Operation successful" });
    } catch {
        console.error("Delete webhook error");
        return NextResponse.json({ status: false, message: "Failed to delete webhook", error: "Failed to delete webhook" }, { status: 500 });
    }
}
