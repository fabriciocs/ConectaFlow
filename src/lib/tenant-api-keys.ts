import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { OAuthScope } from "./oauth/types";

// Managed keys default to read-only. Write scopes require an explicit grant.
export const DEFAULT_API_KEY_SCOPES = [OAuthScope.API_READ, OAuthScope.SESSIONS_READ];
export const MCP_SETUP_API_KEY_SCOPES = [OAuthScope.API_READ, OAuthScope.SESSIONS_READ];

export function hashApiKey(apiKey: string): string {
    return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function managedKeyId(tenantId: string, userId: string): string {
    return `managed-${hashApiKey(JSON.stringify([tenantId, userId]))}`;
}

export function generateApiKey(): string {
    return `wag_${randomBytes(24).toString("base64url")}`;
}

const statusFields = {
    keyPrefix: true,
    createdAt: true,
    lastUsedAt: true,
} as const;

export async function getManagedApiKey(tenantId: string, userId: string) {
    return prisma.apiCredential.findFirst({
        where: { id: managedKeyId(tenantId, userId), tenantId, userId, revokedAt: null },
        select: statusFields,
    });
}

export async function provisionManagedApiKey(tenantId: string, userId: string, rotate = false) {
    const id = managedKeyId(tenantId, userId);
    const apiKey = generateApiKey();
    const now = new Date();
    const data = {
        keyHash: hashApiKey(apiKey),
        keyPrefix: apiKey.slice(0, 8),
        scopes: MCP_SETUP_API_KEY_SCOPES,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: now,
    };

    const inserted = await prisma.apiCredential.createMany({
        data: { id, tenantId, userId, name: "Managed API key", ...data },
        skipDuplicates: true,
    });
    if (inserted.count === 1) {
        return { configured: true, created: true, apiKey, prefix: data.keyPrefix, createdAt: now };
    }

    if (rotate) {
        // Rotate the secret atomically without modifying an active key's approved scopes.
        const rotated = await prisma.apiCredential.updateMany({
            where: { id, tenantId, userId, revokedAt: null },
            data: { keyHash: data.keyHash, keyPrefix: data.keyPrefix, createdAt: now, lastUsedAt: null },
        });
        if (rotated.count === 1) {
            return { configured: true, created: true, apiKey, prefix: data.keyPrefix, createdAt: now };
        }
    }

    // Reissuing a revoked key never restores historic elevated permissions.
    const updated = await prisma.apiCredential.updateMany({
        where: { id, tenantId, userId, revokedAt: { not: null } },
        data,
    });
    if (updated.count === 1) {
        return { configured: true, created: true, apiKey, prefix: data.keyPrefix, createdAt: now };
    }

    const existing = await getManagedApiKey(tenantId, userId);
    if (!existing) throw new Error("Managed API credential unavailable");
    return { configured: true, created: false, apiKey: null, prefix: existing.keyPrefix, createdAt: existing.createdAt };
}

export async function revokeManagedApiKey(tenantId: string, userId: string) {
    await prisma.apiCredential.updateMany({
        where: { id: managedKeyId(tenantId, userId), tenantId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

export async function validateApiKeyValue(apiKey: string) {
    if (!apiKey || apiKey.length > 256) return null;
    const now = new Date();
    const keyHash = hashApiKey(apiKey);
    const usableKey = {
        keyHash, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const credential = await prisma.apiCredential.findFirst({
        where: {
            ...usableKey,
            tenant: { status: "ACTIVE", suspendedAt: null },
        },
        select: {
            id: true, tenantId: true, userId: true, scopes: true,
            user: { select: { id: true, email: true, name: true, emailVerified: true } },
        },
    });
    if (!credential || !credential.user.emailVerified) return null;

    const membership = await prisma.tenantMembership.findFirst({
        where: { userId: credential.userId, tenantId: credential.tenantId, status: "ACTIVE", revokedAt: null },
        select: { id: true },
    });
    if (!membership) return null;

    const used = await prisma.apiCredential.updateMany({
        where: { id: credential.id, ...usableKey },
        data: { lastUsedAt: now },
    });
    if (!used.count) return null;

    const tenantScopes = Array.isArray(credential.scopes)
        ? credential.scopes.filter((scope): scope is string => typeof scope === "string")
        : [];
    return {
        ...credential.user,
        role: "USER" as const,
        credentialTenantId: credential.tenantId,
        tenantCredentialId: credential.id,
        tenantScopes,
    };
}
