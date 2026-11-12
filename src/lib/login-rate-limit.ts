import { createHmac } from "node:crypto";
import { checkOAuthRateLimitDistributed, trustedProxyClientIp } from "./oauth/dcr-rate-limit";

export type LoginAttemptRateLimiter = typeof checkOAuthRateLimitDistributed;

/**
 * Shared rate limits before password hashing, with no plaintext identity in
 * bucket keys and no distinction between registered/non-registered accounts.
 * Fail closed if the secret or shared limiter is unavailable.
 */
export async function checkLoginAttemptQuota(
  email: string,
  request: Request,
  options: {
    secret?: string;
    limiter?: LoginAttemptRateLimiter;
  } = {},
): Promise<boolean> {
  const secret = options.secret ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 320) return false;
  const identity = createHmac("sha256", secret).update(normalizedEmail).digest("hex");
  const source = trustedProxyClientIp(request);
  const limiter = options.limiter ?? checkOAuthRateLimitDistributed;
  try {
    const results = await Promise.all([
      limiter("login-identity", identity, { limit: 8, windowMs: 15 * 60_000 }),
      limiter("login-origin", source, { limit: 90, windowMs: 15 * 60_000 }),
    ]);
    return results.every((result) => result.allowed);
  } catch {
    return false;
  }
}
