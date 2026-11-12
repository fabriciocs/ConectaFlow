import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { prisma } from "@/lib/prisma";

// GET: Get all chats with a specific label
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; labelId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, labelId } = await params;

        // Check if user can access this session
        const session = await getAuthorizedSession(user, request, sessionId);
        if (!session) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const labelScope = { tenantId: session.tenantId, sessionId: session.sessionId };

        // Verify label exists
        const label = await prisma.label.findUnique({
            where: { id: labelId, ...labelScope }
        });

        if (!label) {
            return NextResponse.json({ status: false, message: "Label not found", error: "Label not found" }, { status: 404 });
        }

        // Get all chats with this label
        const chatLabels = await prisma.chatLabel.findMany({
            where: {
                labelId, tenantId: session.tenantId, label: labelScope
            },
            include: {
                label: true
            }
        });

        const chatJids = chatLabels.map(cl => cl.chatJid);

        return NextResponse.json({ 
            success: true,
            label,
            chats: chatJids,
            count: chatJids.length
        });

    } catch (error) {
        console.error("Get chats by label error:", error);
        return NextResponse.json({ status: false, message: "Failed to get chats by label", error: "Failed to get chats by label" }, { status: 500 });
    }
}
