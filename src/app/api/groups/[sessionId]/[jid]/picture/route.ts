import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { errorMessage } from "@/lib/error-message";
import { MultipartLimitError, readBoundedMultipartForm } from "@/lib/multipart-limits";
import sharp from "sharp";

// PUT: Update group picture
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid } = await params;
        const decodedJid = decodeURIComponent(jid);
        const canAccess = await canAccessSession(user, request, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session" }, { status: 403 });
        }
        const formData = await readBoundedMultipartForm(request, 8 * 1024 * 1024);
        const file = formData.get("file") as File;

        if (!(file instanceof File) || file.size === 0 || !["image/jpeg", "image/png"].includes(file.type)) {
            return NextResponse.json({ status: false, message: "Valid JPEG or PNG is required" }, { status: 400 });
        }
        if (file.size > 8 * 1024 * 1024) {
            return NextResponse.json({ status: false, message: "Image too large" }, { status: 413 });
        }



        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        // Convert File to Buffer
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
            const metadata = await sharp(buffer, { limitInputPixels: 4096 * 4096 }).metadata();
            if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
                return NextResponse.json({ status: false, message: "Image dimensions exceed policy" }, { status: 400 });
            }
        } catch {
            return NextResponse.json({ status: false, message: "Invalid or oversized image" }, { status: 400 });
        }

        // Update group picture
        await instance.socket.updateProfilePicture(decodedJid, buffer);

        return NextResponse.json({ status: true, message: "Group picture updated successfully" });

    } catch (error: unknown) {
        if (error instanceof MultipartLimitError) {
            return NextResponse.json({ status: false, message: error.message }, { status: error.status });
        }
        console.error("Update group picture error");
        const message = errorMessage(error, "");
        // Handle specific errors
        if (message.includes("not-admin") || message.includes("forbidden")) {
            return NextResponse.json({ status: false, message: "Bot must be admin to update group picture", error: "Bot must be admin to update group picture" }, { status: 403 });
        }
        
        return NextResponse.json({ status: false, message: "Failed to update group picture", error: "Failed to update group picture" }, { status: 500 });
    }
}

// DELETE: Remove group picture
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid } = await params;
        const decodedJid = decodeURIComponent(jid);

        // Check verification
        const canAccess = await canAccessSession(user, request, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        // Remove group picture
        await instance.socket.removeProfilePicture(decodedJid);

        return NextResponse.json({ status: true, message: "Group picture removed successfully" });

    } catch (error: unknown) {
        console.error("Remove group picture error:", error);
        const message = errorMessage(error, "");
        if (message.includes("not-admin") || message.includes("forbidden")) {
            return NextResponse.json({ status: false, message: "Bot must be admin to remove group picture", error: "Bot must be admin to remove group picture" }, { status: 403 });
        }
        
        return NextResponse.json({ status: false, message: "Failed to remove group picture", error: "Failed to remove group picture" }, { status: 500 });
    }
}
