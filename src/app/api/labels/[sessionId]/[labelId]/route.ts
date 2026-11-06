import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getAuthorizedSession } from "@/lib/session-access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// PUT: Update label
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, labelId: string }> }
) {
    
    try {
        const { sessionId, labelId } = await params;
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name, color } = body;

        const session = await getAuthorizedSession(user, request, sessionId);
        if (!session) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }
        const labelScope = { id: labelId, tenantId: session.tenantId, sessionId: session.sessionId };

        // Prepare update data
        const updateData: Prisma.LabelUpdateInput = {};
        if (name) updateData.name = name;
        if (color !== undefined) {
            if (color < 0 || color > 19) {
                return NextResponse.json({ status: false, message: "Color must be between 0 and 19", error: "Color must be between 0 and 19" }, { status: 400 });
            }
            const colorMap = [
                "#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF",
                "#4B0082", "#9400D3", "#FF1493", "#00CED1", "#32CD32",
                "#FFD700", "#FF69B4", "#8B4513", "#2F4F4F", "#696969",
                "#708090", "#778899", "#B0C4DE", "#ADD8E6", "#F0E68C"
            ];
            updateData.color = color;
            updateData.colorHex = colorMap[color];
        }

        const updatedLabel = await prisma.label.update({
            where: labelScope,
            data: updateData
        });

        return NextResponse.json({ status: true, message: "Operation successful", data: updatedLabel });

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return NextResponse.json({ status: false, message: "Label not found" }, { status: 404 });
        }
        console.error("Update label error:", error);
        return NextResponse.json({ status: false, message: "Failed to update label", error: "Failed to update label" }, { status: 500 });
    }
}

// DELETE: Delete label
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, labelId: string }> }
) {
    try {
        const { sessionId, labelId } = await params;
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const session = await getAuthorizedSession(user, request, sessionId);
        if (!session) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }
        const labelScope = { id: labelId, tenantId: session.tenantId, sessionId: session.sessionId };

        // Delete label (cascade will delete chatLabels)
        await prisma.label.delete({
            where: {
                ...labelScope,
                chatLabels: {
                    none: { OR: [{ tenantId: null }, { tenantId: { not: session.tenantId } }] },
                },
            },
        });

        return NextResponse.json({ status: true, message: "Label deleted successfully" });

    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return NextResponse.json({ status: false, message: "Label not found" }, { status: 404 });
        }
        console.error("Delete label error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete label", error: "Failed to delete label" }, { status: 500 });
    }
}
