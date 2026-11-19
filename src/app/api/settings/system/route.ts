import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { resolveBrandConfig } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { withPrivilegedAdministration } from "@/lib/tenancy/privileged";

const configId = "default";
const settingsRead = { appName: true, logoUrl: true, faviconUrl: true, timezone: true } as const;
const settingsInput = z.object({
    appName: z.string().trim().min(1).optional(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    timezone: z.string().trim().min(1).optional(),
    enableRegistration: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

function settingsData<T>(config: T | null) {
    if (config) return config;
    const brand = resolveBrandConfig({});
    return { appName: brand.name, logoUrl: brand.logoUrl, faviconUrl: brand.faviconUrl, timezone: "Asia/Jakarta" };
}

export async function GET(request: Request) {
    if (request.headers.has("x-wa-akg-admin-reason") || request.headers.has("x-wa-akg-admin-totp")) {
        return withPrivilegedAdministration(request, {
            name: "SYSTEM_SETTINGS_READ", action: "READ", resourceType: "SystemConfig", resourceId: configId,
        }, async (tx) => {
            const config = await tx.systemConfig.findUnique({ where: { id: configId } });
            return { data: { status: true, message: "System config fetched", data: settingsData(config) } };
        });
    }

    try {
        if (request.headers.has("authorization") || request.headers.has("x-api-key") || !await getAuthenticatedUser()) {
            return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
        }
        const config = await prisma.systemConfig.findUnique({ where: { id: configId }, select: settingsRead });
        return NextResponse.json(
            { status: true, message: "System config fetched", data: settingsData(config) },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return NextResponse.json({ status: false, message: "Failed to fetch settings" }, { status: 500 });
    }
}

export function POST(request: Request) {
    return withPrivilegedAdministration(request, {
        name: "SYSTEM_SETTINGS_UPDATE", action: "WRITE", resourceType: "SystemConfig", resourceId: configId,
    }, async (tx) => {
        const parsed = settingsInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return { status: 400, data: { status: false, message: "Validation error" } };
        }
        const config = await tx.systemConfig.upsert({
            where: { id: configId },
            update: parsed.data,
            create: { id: configId, ...parsed.data },
        });
        return { data: { status: true, message: "System settings updated", data: config } };
    });
}
