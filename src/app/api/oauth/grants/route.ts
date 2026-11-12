import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { listAllGrants, listUserGrants, oauthJson } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return oauthJson({ error: "unauthorized" }, 401);
  if (user.role === "SUPERADMIN") return oauthJson(await listAllGrants());
  return oauthJson(await listUserGrants(user.id));
}
