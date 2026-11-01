import { NextRequest } from "next/server";
import { bearerFrom, oauthJson } from "@/lib/oauth/http";
import { authenticateAccessToken, hasAnyScope, OAuthScope } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { projectSessionCapabilitiesToPublic } from "@/lib/oauth/grant-capabilities";

export async function GET(request: NextRequest) {
  const token = bearerFrom(request);
  const principal = token ? await authenticateAccessToken(token) : null;
  if (!principal || !principal.userId) {
    return oauthJson({ error: "invalid_token" }, 401);
  }
  if (!hasAnyScope(principal.scope, [OAuthScope.MCP_READ, OAuthScope.API_READ, OAuthScope.SESSIONS_READ])) {
    return oauthJson({ error: "insufficient_scope" }, 403);
  }
  const rawCapabilities = principal.sessionCapabilities ?? {};
  const capabilityKeys = Object.keys(rawCapabilities);
  const sessions = capabilityKeys.length ? await prisma.session.findMany({
    where: { OR: [{ id: { in: capabilityKeys } }, { sessionId: { in: capabilityKeys } }] },
    select: { id: true, sessionId: true },
  }) : [];
  const sessionCapabilities = projectSessionCapabilitiesToPublic(rawCapabilities, sessions);
  return oauthJson({
    sub: principal.userId,
    wa_akg: { client_id: principal.clientId, scope: principal.scope, session_scope: Object.keys(sessionCapabilities), session_capabilities: sessionCapabilities, operation_allowlist: principal.operationAllowlist, resource: principal.resource },
  });
}
