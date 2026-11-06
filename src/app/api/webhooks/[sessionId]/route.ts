import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { normalizeWebhookFilters } from "@/lib/webhook-filters";
import { sanitizeWebhookUrl } from "@/lib/webhook-redaction";
import { validateSafeUrl } from "@/lib/security";
import { protectWebhookRequestHeaders, revealWebhookRequestHeaders } from "@/lib/webhook-headers";

type StoredWebhookHeaders = string | null;
const webhookFields = {
    id: true, tenantId: true, userId: true, sessionId: true, name: true, url: true,
    allowLocal: true, events: true, filters: true, isActive: true, createdAt: true, updatedAt: true,
} as const;
const privateResponseHeaders = { "Cache-Control": "no-store" };

function serializeWebhook<T extends { url: string; requestHeaders?: StoredWebhookHeaders }>(
    { requestHeaders, ...webhook }: T,
    browserSession: boolean,
) {
    return browserSession
        ? { ...webhook, requestHeaders: revealWebhookRequestHeaders(requestHeaders) }
        : { ...webhook, url: sanitizeWebhookUrl(webhook.url) };
}

/**
 * The transport agent owns header parsing and validation. Keep this adapter
 * local to the API boundary so the persisted value is always validated and
 * protected rather than an unchecked multiline input.
 */
async function validateWebhookUrl(url: unknown, allowLocal: boolean) {
    return validateSafeUrl(url as string, { allowHttp: true, allowLocal });
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    // Verify access to session
    const session = await getAuthorizedSession(user, request, sessionId);
    if (!session) {
        return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
    }

    try {
        const browserSession = user.authMethod === "session";
        const webhooks = await prisma.webhook.findMany({
            where: {
                tenantId: session.tenantId,
                userId: user.id,
                OR: [{ sessionId: session.id }, { sessionId: null }],
            },
            select: {
                ...webhookFields,
                requestHeaders: browserSession,
                session: { select: { id: true, sessionId: true, name: true, status: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        const safeWebhooks = webhooks.map((webhook) => serializeWebhook(webhook, browserSession));
        return NextResponse.json({ status: true, message: "Webhooks retrieved successfully", data: safeWebhooks }, { headers: privateResponseHeaders });
    } catch {
        console.error("Failed to fetch webhooks");
        return NextResponse.json({ status: false, message: "Failed to fetch webhooks", error: "Failed to fetch webhooks" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    const session = await getAuthorizedSession(user, request, sessionId);
    if (!session) {
        return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ status: false, message: "Invalid request body" }, { status: 400 });
        const { name, url, secret, events } = body;
        const allowLocal = body.allowLocal === undefined ? false : body.allowLocal;
        if (typeof allowLocal !== "boolean") {
            return NextResponse.json({ status: false, message: "allowLocal must be a boolean", error: "allowLocal must be a boolean" }, { status: 400 });
        }

        let requestHeaders: StoredWebhookHeaders = null;
        if (hasOwn(body, "requestHeaders")) {
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

        let filters;
        try { filters = normalizeWebhookFilters(body.filters); }
        catch (error) { return NextResponse.json({ status: false, message: (error as Error).message }, { status: 400 }); }

        if (typeof name !== "string" || !name.trim() || typeof url !== "string" || !events || !Array.isArray(events) || events.length === 0 || !events.every((event: unknown) => typeof event === "string")) {
            return NextResponse.json({ status: false, message: "Name, URL, and at least one event are required", error: "Name, URL, and at least one event are required" }, { status: 400 });
        }

        const urlValidation = await validateWebhookUrl(url, allowLocal);
        if (!urlValidation.valid) {
            return NextResponse.json({ status: false, message: `Invalid webhook URL: ${urlValidation.error}`, error: urlValidation.error }, { status: 400 });
        }

        const browserSession = user.authMethod === "session";
        const webhook = await prisma.webhook.create({
            data: {
                tenantId: session.tenantId,
                userId: user.id,
                name,
                url,
                allowLocal,
                requestHeaders,
                secret: secret || null,
                sessionId: session.id, // Strictly link to this session
                events,
                filters: filters ?? undefined,
                isActive: true
            },
            select: { ...webhookFields, requestHeaders: browserSession },
        });

        const safeWebhook = serializeWebhook(webhook, browserSession);
        return NextResponse.json({ status: true, message: "Webhook created successfully", data: safeWebhook }, { headers: privateResponseHeaders });
    } catch {
        console.error("Failed to create webhook");
        return NextResponse.json({ status: false, message: "Failed to create webhook", error: "Failed to create webhook" }, { status: 500 });
    }
}
