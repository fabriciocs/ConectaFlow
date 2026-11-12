import { NextRequest, NextResponse } from "next/server";
import { requestBasePath, requestPublicOrigin, withBasePath } from "@/lib/base-path";

// The root middleware can be active instead of src/proxy.ts in custom-server
// deployments. Keep the legacy OAuth URL available as a real Next.js route.
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
    const basePath = requestBasePath(request.headers);
    const origin = requestPublicOrigin(request.headers, request.url);
    const destination = new URL(withBasePath("/api/oauth/authorize", basePath) + request.nextUrl.search, origin);
    return NextResponse.redirect(destination, {
        status: 307,
        headers: { "Cache-Control": "no-store" },
    });
}
