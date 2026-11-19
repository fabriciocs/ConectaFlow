
import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { MultipartLimitError, readBoundedMultipartForm } from "@/lib/multipart-limits";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid } = await params;
        const canAccess = await canAccessSession(user, request, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session" }, { status: 403 });
        }
        const formData = await readBoundedMultipartForm(request, 64 * 1024 * 1024);
        const file = formData.get("file") as File;
        const type = formData.get("type") as string; // image, video, audio, document
        const caption = formData.get("caption") as string || "";
        
        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json({ status: false, message: "A nonempty file is required" }, { status: 400 });
        }
        if (file.size > 64 * 1024 * 1024) {
            return NextResponse.json({ status: false, message: "File too large" }, { status: 413 });
        }
        if (!["image", "video", "audio", "voice", "document", "sticker"].includes(type)) {
            return NextResponse.json({ status: false, message: "Unsupported media type" }, { status: 400 });
        }
        if ((type === "image" || type === "sticker") && !file.type.startsWith("image/")) {
            return NextResponse.json({ status: false, message: "Invalid image MIME type" }, { status: 400 });
        }
        if (typeof caption !== "string" || caption.length > 4096 || file.name.length > 255) {
            return NextResponse.json({ status: false, message: "Invalid media metadata" }, { status: 400 });
        }



        const decodedJid = decodeURIComponent(jid);

        // WhatsApp Channel (Newsletter) strictly enforces JPEG format for images
        // Sending PNGs or other formats will cause the Mobile client to crash/fail to load.
        if (decodedJid.includes('@newsletter') && type === 'image' && file.type !== 'image/jpeg') {
            return NextResponse.json(
                { 
                    status: false, 
                    message: "WhatsApp Channels/Newsletters sementara waktu HANYA mendukung format gambar JPG/JPEG. Silakan gunakan format tersebut.", 
                    error: "Unsupported media format for Newsletter" 
                }, 
                { status: 400 }
            );
        }
        const buffer = Buffer.from(await file.arrayBuffer());

        // Send via ChatService
        const sent = await ChatService.sendMediaMessage(
             sessionId, 
             decodedJid, 
             buffer, 
             type, 
             file.type, 
             file.name, 
             caption
        );

        return NextResponse.json({ status: true, message: "Operation successful", data: sent });

    } catch (e) {
        if (e instanceof MultipartLimitError) {
            return NextResponse.json({ status: false, message: e.message }, { status: e.status });
        }
        console.error("Media send error");
        return NextResponse.json({ status: false, message: "Failed to send media", error: "Failed to send media" }, { status: 500 });
    }
}
