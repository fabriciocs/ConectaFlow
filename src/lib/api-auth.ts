import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import type { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";
import { authenticateAccessToken } from "./oauth";
import { hasRequiredOAuthScope, normalizeApiPathname, requiredOAuthScopes } from "./oauth/api-policy";
import { resourceMatchesPublicOrigin } from "./oauth/discovery.mjs";
import { requestPublicOrigin } from "./base-path";

type ApiKeyUser = {
    id: string;
    email: string;
    name: string | null;
    role: "SUPERADMIN" | "STAFF" | "USER";
};

const apiKeyUserSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    apiKey: true,
    apiKeyHash: true,
} as const;

/**
 * API keys are high-entropy bearer credentials, so a deterministic SHA-256
 * lookup avoids retaining the credential in plaintext while keeping header
 * validation fast. The legacy column is only used for one-time lazy migration.
 */
export function hashApiKey(apiKey: string): string {
    return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function apiKeyPrefix(apiKey: string): string {
    return apiKey.slice(0, 8);
}

export type ApiKeyProvisioningResult = {
    configured: boolean;
    created: boolean;
    apiKey: string | null;
    prefix: string | null;
    createdAt: Date | null;
};

type ApiKeyState = {
    apiKey: string | null;
    apiKeyHash: string | null;
    apiKeyPrefix: string | null;
    apiKeyCreatedAt: Date | null;
};

function apiKeyProvisioningResult(state: ApiKeyState): ApiKeyProvisioningResult {
    return {
        configured: Boolean(state.apiKeyHash || state.apiKey || state.apiKeyPrefix),
        created: false,
        apiKey: null,
        prefix: state.apiKeyPrefix ?? (state.apiKey ? apiKeyPrefix(state.apiKey) : null),
        createdAt: state.apiKeyCreatedAt,
    };
}

/**
 * Provision the current user's first API key exactly once.
 * The plaintext credential is returned only to the request that wins the
 * guarded insert; existing credentials are intentionally never revealed.
 */
export async function ensureApiKeyForUser(userId: string): Promise<ApiKeyProvisioningResult | null> {
    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { apiKey: true, apiKeyHash: true, apiKeyPrefix: true, apiKeyCreatedAt: true },
    });
    if (!existing) return null;
    if (existing.apiKey || existing.apiKeyHash || existing.apiKeyPrefix) return apiKeyProvisioningResult(existing);

    const newApiKey = generateApiKey();
    const now = new Date();
    const inserted = await prisma.user.updateMany({
        where: { id: userId, apiKey: null, apiKeyHash: null },
        data: {
            apiKey: null,
            apiKeyHash: hashApiKey(newApiKey),
            apiKeyPrefix: apiKeyPrefix(newApiKey),
            apiKeyCreatedAt: now,
            apiKeyLastUsedAt: null,
        },
    });

    if (inserted.count === 1) {
        return { configured: true, created: true, apiKey: newApiKey, prefix: apiKeyPrefix(newApiKey), createdAt: now };
    }

    const raced = await prisma.user.findUnique({
        where: { id: userId },
        select: { apiKey: true, apiKeyHash: true, apiKeyPrefix: true, apiKeyCreatedAt: true },
    });
    return raced ? apiKeyProvisioningResult(raced) : null;
}

function toApiKeyUser(user: Pick<ApiKeyUser, "id" | "email" | "name" | "role">): ApiKeyUser {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
    };
}

/**
 * Validate an API key value supplied by a trusted transport header/payload.
 * Never log or return the credential itself.
 */
export async function validateApiKeyValue(apiKey: string): Promise<ApiKeyUser | null> {
    if (!apiKey || apiKey.length > 256) return null;

    const keyHash = hashApiKey(apiKey);

    try {
        const hashedUser = await prisma.user.findUnique({
            where: { apiKeyHash: keyHash },
            select: apiKeyUserSelect,
        });

        if (hashedUser) {
            await prisma.user.update({
                where: { id: hashedUser.id },
                data: { apiKeyLastUsedAt: new Date() },
            });
            return toApiKeyUser(hashedUser);
        }

        // Compatibility path for keys issued before the additive migration.
        // A successful match immediately replaces the plaintext value with its hash.
        const legacyUser = await prisma.user.findFirst({
            where: { apiKey },
            select: apiKeyUserSelect,
        });

        if (!legacyUser) return null;

        await prisma.user.updateMany({
            where: { id: legacyUser.id, apiKey },
            data: {
                apiKey: null,
                apiKeyHash: keyHash,
                apiKeyPrefix: apiKeyPrefix(apiKey),
                apiKeyCreatedAt: new Date(),
                apiKeyLastUsedAt: new Date(),
            },
        });

        return toApiKeyUser(legacyUser);
    } catch (error) {
        logger.error("Auth", "API key validation error:", error);
        return null;
    }
}

/**
 * Validate API key from the request header. Query parameters are deliberately
 * ignored so bearer credentials cannot leak through URLs, access logs, or referrers.
 */
export async function validateApiKey(request: NextRequest) {
    const apiKey = request.headers.get("x-api-key");
    return apiKey ? validateApiKeyValue(apiKey) : null;
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    const authorization = request?.headers.get("authorization");
    if (authorization && /^Bearer\s/i.test(authorization)) {
        const token = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1];
        const principal = token ? await authenticateAccessToken(token) : null;
        if (!principal?.userId) return null;
        if (principal.resource) {
            if (!resourceMatchesPublicOrigin(principal.resource, {
                configuredIssuer: process.env.OAUTH_ISSUER_URL,
                configuredOrigin: process.env.BASE_URL,
                requestOrigin: requestPublicOrigin(request!.headers, request!.url),
            })) return null;
        }

        const pathname = normalizeApiPathname(request!.nextUrl.pathname, "");
        if (!pathname) return null;
        if (/^\/api\/(?:auth(?:\/|$)|user\/api-key(?:\/|$)|users(?:\/|$)|settings\/system(?:\/|$))/.test(pathname)) return null;
        const method = request!.method.toUpperCase();
        const needed = requiredOAuthScopes(method, pathname);
        if (!hasRequiredOAuthScope(principal.scope, needed)) return null;

        if (principal.sessionScope) {
            if (pathname === "/api/sessions") {
                if (method !== "GET") return null;
            }
            const match = pathname.match(/^\/api\/(?:sessions|messages|contacts|groups|webhooks|autoreplies|scheduler|chat|chats|profile|labels|status|system\/monitor)\/([^/]+)/);
            if (!match && pathname !== "/api/sessions") return null;
            if (match) {
                const requestedSession = decodeURIComponent(match[1]);
                const session = await prisma.session.findFirst({
                    where: { OR: [{ id: requestedSession }, { sessionId: requestedSession }] },
                    select: { id: true },
                });
                if (!session || !principal.sessionScope.includes(session.id)) return null;
                const capability = principal.sessionCapabilities?.[session.id] ?? "READ";
                if (method !== "GET" && capability !== "WRITE") return null;
            }
        }

        const user = await prisma.user.findUnique({
            where: { id: principal.userId },
            select: { id: true, email: true, name: true, role: true, emailVerified: true },
        });
        if (user?.emailVerified) return { ...user, authMethod: "oauth" as const, oauthScopes: principal.scope, oauthSessionScope: principal.sessionScope };
        return null;
    }

    // First try API key if request is provided
    if (request) {
        const apiKeyUser = await validateApiKey(request);
        if (apiKeyUser) {
            return { ...apiKeyUser, authMethod: "apiKey" as const };
        }
    }

    // Fall back to session auth
    const session = await auth();
    if (session?.user?.id) {
        // Fetch full user data including role
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, email: true, name: true, role: true }
        });

        if (user) {
            return { ...user, authMethod: "session" as const };
        }
    }

    return null;
}

/**
 * Check if user has required role level
 */
export {
    ROLE_HIERARCHY,
    hasRole,
    isAdmin,
    canAccessSession,
    isSessionOwner,
    getAccessibleSessions
} from "./session-access";
export type { Role } from "./session-access";

/**
 * Generate a cryptographically secure API key
 */
export function generateApiKey(): string {
    // 24 cryptographically secure random bytes encode to 32 URL-safe characters.
    // API keys are bearer credentials; Math.random() is not suitable for secrets.
    return `wag_${randomBytes(24).toString("base64url")}`;
}
