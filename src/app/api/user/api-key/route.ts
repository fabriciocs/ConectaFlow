import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateApiKey, hashApiKey } from "@/lib/api-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// Get current user's API key
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                apiKey: true,
                apiKeyPrefix: true,
                apiKeyCreatedAt: true,
                apiKeyLastUsedAt: true,
            }
        });

        return NextResponse.json({
            status: true,
            message: "API key status fetched",
            data: {
                // Kept for response-shape compatibility; an existing key is never returned.
                apiKey: null,
                configured: Boolean(user?.apiKey || user?.apiKeyPrefix),
                prefix: user?.apiKeyPrefix || null,
                createdAt: user?.apiKeyCreatedAt || null,
                lastUsedAt: user?.apiKeyLastUsedAt || null,
            }
        }, { headers: NO_STORE_HEADERS });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to fetch API key", error: "Failed to fetch API key" }, { status: 500 });
    }
}

// Generate new API key
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const newApiKey = generateApiKey();

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                apiKey: null,
                apiKeyHash: hashApiKey(newApiKey),
                apiKeyPrefix: newApiKey.slice(0, 8),
                apiKeyCreatedAt: new Date(),
                apiKeyLastUsedAt: null,
            }
        });

        return NextResponse.json({ status: true, message: "API key generated", data: { apiKey: newApiKey } }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        console.error("Generate API key error:", error);
        return NextResponse.json({ status: false, message: "Failed to generate API key", error: "Failed to generate API key" }, { status: 500 });
    }
}

// Delete/revoke API key
export async function DELETE() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                apiKey: null,
                apiKeyHash: null,
                apiKeyPrefix: null,
                apiKeyCreatedAt: null,
                apiKeyLastUsedAt: null,
            }
        });

        return NextResponse.json({ status: true, message: "API key revoked" });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to revoke API key", error: "Failed to revoke API key" }, { status: 500 });
    }
}
