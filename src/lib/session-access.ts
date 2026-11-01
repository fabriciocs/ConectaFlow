import { prisma } from "./prisma";
import { sanitizeWebhookUrl } from "./webhook-redaction";

// Role hierarchy for permission checks
export const ROLE_HIERARCHY = {
    SUPERADMIN: 3,
    STAFF: 2,
    USER: 1
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

/**
 * Compatibility decision for the legacy SessionAccess relation.
 *
 * SessionAccess remains in the schema for backwards compatibility, but it no
 * longer grants session access to non-administrative users. This keeps the
 * current schema/types usable without preserving shared-session privileges.
 */
export const LEGACY_SESSION_ACCESS_POLICY = "DENY_NON_OWNER" as const;

export type SessionAccessDecision = "SUPERADMIN_GLOBAL" | "OWNER" | "DENIED_LEGACY_SHARED";

/** Resolve the minimum session policy before any database lookup is performed. */
export function resolveSessionAccessDecision(userId: string, userRole: string, ownerId: string): SessionAccessDecision {
    if (isAdmin(userRole)) return "SUPERADMIN_GLOBAL";
    if (userId === ownerId) return "OWNER";
    return "DENIED_LEGACY_SHARED";
}

/** Webhook metadata safe to expose in session responses. Never select `secret`. */
export const SAFE_WEBHOOK_SELECT = {
    id: true,
    userId: true,
    sessionId: true,
    name: true,
    url: true,
    events: true,
    filters: true,
    isActive: true,
    createdAt: true,
    updatedAt: true
} as const;

/** Defense-in-depth serializer for session payloads from current/future queries. */
export function sanitizeSessionWebhooks<T extends { webhooks?: unknown }>(session: T): T {
    if (!Array.isArray(session.webhooks)) return session;
    const webhooks = session.webhooks.map(webhook => {
        if (!webhook || typeof webhook !== "object") return webhook;
        const safeWebhook = { ...(webhook as Record<string, unknown>) };
        delete safeWebhook.secret;
        return safeWebhook;
    });
    return { ...session, webhooks } as T;
}

const SENSITIVE_CONFIG_KEYS = new Set([
    "apikey", "api_key", "clientsecret", "password", "refreshtoken", "secret",
    "token", "access_token", "accesstoken", "privatekey", "requestheaders", "removebgapikey",
]);

function redactConfigValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactConfigValue);
    if (!value || typeof value !== "object") return value;
    const safe: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        if (SENSITIVE_CONFIG_KEYS.has(key.toLowerCase().replace(/[-\s]/g, ""))) continue;
        safe[key] = redactConfigValue(nestedValue);
    }
    return safe;
}

/** Remove connection credentials and opaque secrets from an API/OAuth read. */
export function sanitizeReadOnlySession<T>(session: T): T {
    const safeSession: Record<string, unknown> = { ...(session as object) };
    delete safeSession.qr;
    delete safeSession.pairingCode;
    delete safeSession.config;

    if (Array.isArray(safeSession.webhooks)) {
        safeSession.webhooks = safeSession.webhooks.map(webhook => {
            if (!webhook || typeof webhook !== "object") return webhook;
            const safeWebhook = { ...(webhook as Record<string, unknown>) };
            if (typeof safeWebhook.url === "string") safeWebhook.url = sanitizeWebhookUrl(safeWebhook.url);
            delete safeWebhook.secret;
            delete safeWebhook.requestHeaders;
            return safeWebhook;
        });
    }

    const botConfig = safeSession.botConfig;
    if (botConfig !== undefined) safeSession.botConfig = redactConfigValue(botConfig);

    return safeSession as T;
}

/** Remove connection credentials from a session shared with a non-owner. */
export function sanitizeSharedSession<T>(session: T): T {
    return sanitizeReadOnlySession(session);
}

/** Explicit semantic alias for OAuth/API read-only responses. */
export function sanitizeOAuthReadSession<T>(session: T): T {
    return sanitizeReadOnlySession(session);
}

/** Redact known and nested secret keys from a bot configuration response. */
export function sanitizeReadOnlyBotConfig<T>(config: T): T {
    return redactConfigValue(config) as T;
}

/** Pure ownership rule used by route guards and their tests. */
export function mayManageSession(userId: string, userRole: string, ownerId: string): boolean {
    return isAdmin(userRole) || userId === ownerId;
}

function safeSessionInclude() {
    return {
        user: { select: { name: true, email: true } },
        botConfig: true,
        webhooks: { select: SAFE_WEBHOOK_SELECT },
        _count: { select: { contacts: true, messages: true, groups: true, autoReplies: true, scheduledMessages: true } }
    };
}

/**
 * Check if user has required role level
 */
export function hasRole(userRole: string, requiredRole: Role): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is admin (SUPERADMIN or has admin privileges)
 */
export function isAdmin(userRole: string): boolean {
    return userRole === "SUPERADMIN";
}

/**
 * Check if user can access a session.
 *
 * SessionAccess is intentionally not consulted here: it is a legacy schema
 * relation and must not grant shared access to ordinary users. SUPERADMIN is
 * globally authorized, while all other users must own the session.
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId, userId },
                { sessionId: sessionId, userId }
            ]
        }
    });

    return !!session && resolveSessionAccessDecision(userId, userRole, session.userId) === "OWNER";
}

/**
 * Check if user is the actual owner of a session (not just shared access)
 * Used for protecting management endpoints (e.g. granting/revoking access)
 */
export async function isSessionOwner(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId, userId },
                { sessionId: sessionId, userId }
            ]
        }
    });

    return !!session && mayManageSession(userId, userRole, session.userId);
}

/**
 * Get sessions that user can access.
 *
 * SessionAccess is retained only for schema/type compatibility and is
 * intentionally excluded from this query. Non-administrative users see only
 * sessions they own; SUPERADMIN sees all sessions.
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (isAdmin(userRole)) {
        const sessions = await prisma.session.findMany({
            orderBy: { createdAt: 'desc' },
            include: safeSessionInclude()
        });
        return sessions.map(sanitizeSessionWebhooks);
    }

    const ownedSessions = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: safeSessionInclude()
    });

    return ownedSessions.map(sanitizeSessionWebhooks);
}
