import { isExplicitlyAllowedLocalIp } from "./security";

/**
 * Server-only policy, owned by the operator. The allowLocal flag on a webhook is
 * only a request; it never grants permission to reach host-local services.
 * Format: JSON array of { tenantId: string, url: string } with exact URLs.
 * Only IP-literal private URLs are supported to avoid DNS alias/rebinding grants.
 */
export function isPrivateWebhookDestinationAllowed(
  url: string,
  tenantId: string | null | undefined,
  policy = process.env.WA_AKG_PRIVATE_WEBHOOK_EGRESS_ALLOWLIST_JSON,
): boolean {
  if (!tenantId || !policy || policy.length > 32 * 1024) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) return false;
    if (!isExplicitlyAllowedLocalIp(hostname)) return false;

    const entries: unknown = JSON.parse(policy);
    if (!Array.isArray(entries) || entries.length > 128) return false;
    return entries.some((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const grant = entry as Record<string, unknown>;
      if (grant.tenantId !== tenantId || typeof grant.url !== "string" || grant.url.length > 2048) return false;
      const permitted = new URL(grant.url);
      return !permitted.username && !permitted.password && !permitted.hash &&
        isExplicitlyAllowedLocalIp(permitted.hostname.replace(/^\[|\]$/g, "")) &&
        permitted.href === parsed.href;
    });
  } catch {
    // Invalid or absent operator configuration must never enable local egress.
    return false;
  }
}
