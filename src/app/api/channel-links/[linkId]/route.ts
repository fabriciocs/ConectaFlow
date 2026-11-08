import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSessionUser, findActiveTenantMembership, parseRequestedTenantId,
  notFoundResponse, unauthorizedResponse } from "@/lib/tenancy/server";
import { channelLinkOriginMatches, revokeChannelLink } from "@/lib/channel-identity-linking";

const paramsSchema = z.object({ linkId: z.string().min(1).max(191) });

export async function DELETE(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const user = await getTenantSessionUser(request);
  if (!user) return unauthorizedResponse();
  try {
    if (!channelLinkOriginMatches(request)) return NextResponse.json({ error: "Request rejected" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Revocation unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const tenantId = parseRequestedTenantId(request);
  if (!tenantId || !(await findActiveTenantMembership(user.id, tenantId))) return notFoundResponse();
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return notFoundResponse();

  await revokeChannelLink({ id: params.data.linkId, tenantId, userId: user.id });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
