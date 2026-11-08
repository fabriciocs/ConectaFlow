import { auth } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requestBasePath, requestPublicOrigin, withBasePath } from "@/lib/base-path";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const basePath = requestBasePath(request.headers);
    const publicOrigin = requestPublicOrigin(request.headers, request.url);

    // Compatibility for older OAuth clients that still open /authorize.
    // Forward every parameter unchanged to the existing validated PKCE route.
    if (pathname === "/authorize") {
        const canonical = new URL(withBasePath("/api/oauth/authorize", basePath) + request.nextUrl.search, publicOrigin);
        return NextResponse.redirect(canonical, { status: 307, headers: { "Cache-Control": "no-store" } });
    }

    // Public routes that don't require authentication
    const publicRoutes = [
        "/auth/login", "/auth/register", "/auth/verify-email",
        "/auth/forgot-password", "/auth/reset-password", "/auth/channel-link",
        "/api/auth", "/terms", "/privacy",
    ];

    // Check if it's a public route
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    // Public application assets and the generated PWA manifest never require a session.
    if (
        pathname.startsWith("/_next") ||
        pathname === "/manifest.webmanifest" ||
        (pathname.startsWith("/brand/") && /\.(?:svg|png|ico|webp)$/i.test(pathname)) ||
        pathname === "/favicon.ico" ||
        pathname === "/.well-known/oauth-protected-resource" ||
        pathname === "/.well-known/oauth-authorization-server"
    ) {
        return NextResponse.next();
    }

    // Allow known static asset extensions in root path only (e.g. /vercel.svg)
    const staticExtensions = [".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".ttf"];
    if (pathname.lastIndexOf("/") === 0 && staticExtensions.some(ext => pathname.endsWith(ext))) {
        return NextResponse.next();
    }

    // API routes: Check for valid API key or session
    if (pathname.startsWith("/api/")) {
        // This endpoint authenticates its own dedicated internal bearer token.
        if (pathname === "/api/channel-links/challenges") return NextResponse.next();
        // OAuth protocol endpoints enforce their own client, token, or user-session
        // checks. They must reach their route handlers before an end-user session
        // exists (for example, during authorization-code and token exchange).
        if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/oauth/")) {
            return NextResponse.next();
        }

        if (request.headers.has("x-api-key") || request.headers.has("authorization")) {
            const user = await getAuthenticatedUser(request);
            if (!user) {
                return NextResponse.json({ error: "Invalid credential" }, { status: 401 });
            }
            return NextResponse.next();
        }

        // Check for session auth
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return NextResponse.next();
    }

    // Dashboard routes: Require login
    if (pathname.startsWith("/dashboard")) {
        const session = await auth();

        if (!session?.user) {
            const loginUrl = new URL(withBasePath("/auth/login", basePath), publicOrigin);
            loginUrl.searchParams.set("callbackUrl", withBasePath(pathname, basePath) + request.nextUrl.search);
            return NextResponse.redirect(loginUrl);
        }

        return NextResponse.next();
    }

    // Root path — redirect to dashboard if logged in
    if (pathname === "/") {
        const session = await auth();
        if (session?.user) {
            return NextResponse.redirect(new URL(withBasePath("/dashboard", basePath), publicOrigin));
        }
        return NextResponse.next();
    }

    // Public routes
    if (isPublicRoute) {
        const session = await auth();
        if (session?.user && (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register"))) {
            return NextResponse.redirect(new URL(withBasePath("/dashboard", basePath), publicOrigin));
        }
        return NextResponse.next();
    }

    // Default: require auth for everything else
    const session = await auth();
    if (!session?.user) {
        const loginUrl = new URL(withBasePath("/auth/login", basePath), publicOrigin);
        loginUrl.searchParams.set("callbackUrl", withBasePath(pathname, basePath) + request.nextUrl.search);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
