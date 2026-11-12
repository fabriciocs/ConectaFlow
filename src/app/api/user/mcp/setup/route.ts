import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureApiKeyForUser } from "@/lib/api-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

/**
 * Configure local stdio MCP for the signed-in user.
 * The generated bearer credential is returned only on first provisioning.
 */
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await ensureApiKeyForUser(session.user.id);
        if (!result) {
            return NextResponse.json({ status: false, message: "User not found", error: "User not found" }, { status: 404, headers: NO_STORE_HEADERS });
        }

        return NextResponse.json({
            status: true,
            message: result.created ? "MCP API key generated" : "MCP API key already configured",
            data: result,
        }, { headers: NO_STORE_HEADERS });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to configure MCP", error: "Failed to configure MCP" }, { status: 500, headers: NO_STORE_HEADERS });
    }
}
