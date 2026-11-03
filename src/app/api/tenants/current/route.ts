import { NextResponse } from "next/server";

import {
  badRequestResponse,
  findActiveTenantMembership,
  getTenantSessionUser,
  notFoundResponse,
  parseRequestedTenantId,
  unauthorizedResponse,
} from "@/lib/tenancy/server";

export async function GET(request: Request) {
  const user = await getTenantSessionUser(request);
  if (!user) return unauthorizedResponse();
  if (!request.headers.has("x-tenant-id")) {
    return badRequestResponse("x-tenant-id header is required");
  }

  const tenantId = parseRequestedTenantId(request);
  if (!tenantId) return notFoundResponse();

  const membership = await findActiveTenantMembership(user.id, tenantId);
  if (!membership) return notFoundResponse();

  return NextResponse.json({
    tenant: membership.tenant,
    tenantId: membership.tenantId,
    role: membership.role,
  });
}
