import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { oauthJson, revokeClientGrants } from "@/lib/oauth";

function resolveGrantUserId(role: "SUPERADMIN" | "STAFF" | "USER", authenticatedUserId: string, requestedUserId?: string | null) {
  if (role === "SUPERADMIN") return requestedUserId || authenticatedUserId;
  if (requestedUserId && requestedUserId !== authenticatedUserId) return null;
  return authenticatedUserId;
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return oauthJson({ error: "unauthorized" }, 401);
  const requestedUserId = new URL(request.url).searchParams.get("userId");
  const grantUserId = resolveGrantUserId(user.role, user.id, requestedUserId);
  if (!grantUserId) return oauthJson({ error: "forbidden" }, 403);
  const { clientId } = await params;
  await revokeClientGrants(grantUserId, clientId);
  return oauthJson({ status: true });
}
