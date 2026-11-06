import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { prisma } from "@/lib/prisma";

// GET: Get chats assigned to a specific label OR get labels for a specific chat
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        const { searchParams } = new URL(request.url);
        const labelId = searchParams.get("labelId");
        const jid = searchParams.get("jid");

        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
        }

        const session = await getAuthorizedSession(user, request, sessionId);
        if (!session) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }

        const labelScope = { tenantId: session.tenantId, sessionId: session.sessionId };

        // Mode: Get labels assigned to a specific chat JID
        if (jid) {
            const chatLabels = await prisma.chatLabel.findMany({
                where: {
                    chatJid: decodeURIComponent(jid),
                    tenantId: session.tenantId, label: labelScope
                },
                include: {
                    label: { select: { id: true, name: true, colorHex: true } }
                }
            });
            return NextResponse.json({
                status: true,
                data: chatLabels.map(cl => ({
                    id: cl.id,
                    chatJid: cl.chatJid,
                    labelId: cl.labelId,
                    labelName: cl.label.name,
                    colorHex: cl.label.colorHex
                }))
            });
        }

        // Mode: Get all chat-label assignments (batch for label dots)
        if (!labelId && !jid) {
            const chatLabels = await prisma.chatLabel.findMany({
                where: { tenantId: session.tenantId, label: labelScope },
                include: {
                    label: { select: { colorHex: true, name: true } }
                }
            });
            return NextResponse.json({
                status: true,
                data: chatLabels.map(cl => ({
                    chatJid: cl.chatJid,
                    labelId: cl.labelId,
                    colorHex: cl.label.colorHex,
                    labelName: cl.label.name
                }))
            });
        }

        if (!labelId) {
            return NextResponse.json({ status: false, message: "labelId query param is required" }, { status: 400 });
        }

        // Verify label belongs to session
        const label = await prisma.label.findUnique({
            where: { id: labelId, ...labelScope }
        });

        if (!label) {
            return NextResponse.json({ status: false, message: "Label not found" }, { status: 404 });
        }

        // Get all chatLabels for this label with contact info
        const chatLabels = await prisma.chatLabel.findMany({
            where: { labelId, tenantId: session.tenantId, label: labelScope },
            orderBy: { createdAt: "desc" }
        });

        // Enrich with contact names if available
        const enriched = await Promise.all(
            chatLabels.map(async (cl) => {
                const contact = await prisma.contact.findFirst({
                    where: {
                        sessionId: session.id,
                        tenantId: session.tenantId,
                        jid: cl.chatJid
                    },
                    select: { name: true, notify: true }
                });
                const contactName = contact?.name || contact?.notify || undefined;
                return {
                    id: cl.id,
                    chatJid: cl.chatJid,
                    labelId: cl.labelId,
                    contactName
                };
            })
        );

        return NextResponse.json({ status: true, data: enriched });

    } catch (error) {
        console.error("Get label chats error:", error);
        return NextResponse.json({ status: false, message: "Failed to get label chats" }, { status: 500 });
    }
}
