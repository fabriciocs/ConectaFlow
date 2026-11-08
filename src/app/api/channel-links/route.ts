import { NextResponse } from "next/server";
import { getTenantSessionUser, findActiveTenantMembership, parseRequestedTenantId,
  notFoundResponse, unauthorizedResponse } from "@/lib/tenancy/server";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await getTenantSessionUser(request);
  if (!user) return unauthorizedResponse();
  const tenantId = parseRequestedTenantId(request);
  if (!tenantId || !(await findActiveTenantMembership(user.id, tenantId))) return notFoundResponse();

  const links = await prisma.channelIdentityLink.findMany({
    where: { tenantId, userId: user.id },
    select: { id: true, channel: true, status: true, linkedAt: true, expiresAt: true, revokedAt: true,
      session: { select: { name: true } } },
    orderBy: { linkedAt: "desc" },
  });
  return NextResponse.json({ links }, { headers: noStore });
}
