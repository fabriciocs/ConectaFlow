import type { Prisma } from "@prisma/client";
import { revealWebhookRequestHeaders } from "./webhook-headers";
import { sanitizeWebhookUrl } from "./webhook-redaction";

/**
 * Restrict a webhook to the authenticated owner's effective tenant and session.
 * A null sessionId means "all sessions" of that SAME tenant, never all tenants.
 * Legacy rows with tenantId=null are deliberately excluded (fail closed).
 */
export function webhookScopedWhere(
  session: { id: string; tenantId: string },
  userId: string,
  id?: string,
): Prisma.WebhookWhereInput {
  if (!session.tenantId || !userId || !session.id) {
    throw new Error("Webhook tenant and session context are required");
  }
  return {
    ...(id === undefined ? {} : { id }),
    tenantId: session.tenantId,
    userId,
    OR: [{ sessionId: session.id }, { sessionId: null }],
  };
}

/**
 * Never disclose existing webhook credentials to bearer principals. Browser
 * sessions may access their own configured headers through the authenticated UI.
 */
export function serializeAuthorizedWebhook<
  T extends { url: string; requestHeaders: string | null; secret: string | null }
>(webhook: T, authMethod: "session" | "apiKey" | "oauth") {
  const { secret, requestHeaders, ...publicFields } = webhook;
  void secret;
  if (authMethod === "session") {
    return { ...publicFields, requestHeaders: revealWebhookRequestHeaders(requestHeaders) };
  }
  return { ...publicFields, url: sanitizeWebhookUrl(publicFields.url) };
}
