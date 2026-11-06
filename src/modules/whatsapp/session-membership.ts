import type { Prisma } from "@prisma/client";

export type WhatsAppSessionBinding = {
    sessionId: string;
    tenantId: string;
    userId: string;
};

export function activeWhatsAppSessionWhere(binding: WhatsAppSessionBinding): Prisma.SessionWhereUniqueInput {
    const { sessionId, tenantId, userId } = binding;
    return {
        sessionId,
        tenantId,
        userId,
        tenant: { status: "ACTIVE", suspendedAt: null },
        user: {
            tenantMemberships: { some: { tenantId, status: "ACTIVE", revokedAt: null } },
        },
    };
}
