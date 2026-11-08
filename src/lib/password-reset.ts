import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/mail-delivery";
import { getBrandConfig } from "@/lib/branding-server";
import { normalizeBasePath, requestBasePath, withBasePath } from "@/lib/base-path";
import { checkOAuthRateLimitDistributed, trustedProxyClientIp } from "@/lib/oauth/dcr-rate-limit";

const TOKEN_TTL_MS = 30 * 60 * 1000;
const SECRET_MIN_LENGTH = 16;
type PasswordCredential = { id: string; password: string };

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < SECRET_MIN_LENGTH) throw new Error("Password reset is not configured");
  return secret;
}

function signature(payload: string, passwordHash: string, secret: string) {
  return createHmac("sha256", secret).update(payload).update(".").update(passwordHash).digest();
}

/** Tokens are bound to the current password hash: a successful change invalidates the link. */
export function createPasswordResetToken(
  user: PasswordCredential,
  now = Date.now(),
  secret = signingSecret(),
) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id, exp: now + TOKEN_TTL_MS, nonce: randomBytes(32).toString("base64url"),
  })).toString("base64url");
  return payload + "." + signature(payload, user.password, secret).toString("base64url");
}

export function verifyPasswordResetToken(
  token: string,
  user: PasswordCredential,
  now = Date.now(),
  secret = signingSecret(),
): boolean {
  if (token.length > 1024 || token.length < 80) return false;
  const sections = token.split(".");
  if (sections.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(sections[0]) ||
      !/^[A-Za-z0-9_-]{43}$/.test(sections[1])) return false;
  try {
    const data: unknown = JSON.parse(Buffer.from(sections[0], "base64url").toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const fields = data as Record<string, unknown>;
    if (fields.id !== user.id || typeof fields.exp !== "number" ||
        !Number.isSafeInteger(fields.exp) || fields.exp <= now ||
        fields.exp > now + TOKEN_TTL_MS ||
        typeof fields.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(fields.nonce)) return false;
    const provided = Buffer.from(sections[1], "base64url");
    const expected = signature(sections[0], user.password, secret);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export function resetTokenUserId(token: string): string | null {
  if (typeof token !== "string" || token.length > 1024 || token.length < 80) return null;
  const payload = token.split(".")[0];
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const id = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).id : null;
    return typeof id === "string" && /^[a-zA-Z0-9_-]{8,191}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function checkPasswordResetQuota(email: string, request: Request): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const secret = signingSecret();
  const identity = createHmac("sha256", secret).update(normalized).digest("hex");
  try {
    const [byIdentity, byOrigin] = await Promise.all([
      checkOAuthRateLimitDistributed("password-reset-identity", identity, { limit: 3, windowMs: 60 * 60_000 }),
      checkOAuthRateLimitDistributed("password-reset-origin", trustedProxyClientIp(request), { limit: 30, windowMs: 60 * 60_000 }),
    ]);
    return byIdentity.allowed && byOrigin.allowed;
  } catch {
    return false;
  }
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function requestPasswordReset(email: string, request: Request) {
  // Always return the same public response, including for unknown users or unavailable mail.
  try {
    if (!(await checkPasswordResetQuota(email, request))) return;
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, password: true },
    });
    if (!user) return;

    const configured = process.env.BASE_URL || process.env.OAUTH_ISSUER_URL;
    if (!configured && process.env.NODE_ENV === "production") throw new Error("BASE_URL is required");
    const publicUrl = configured ? new URL(configured) : new URL(request.url);
    if (process.env.NODE_ENV === "production" && publicUrl.protocol !== "https:") {
      throw new Error("HTTPS required for password recovery");
    }
    const basePath = normalizeBasePath(publicUrl.pathname) || normalizeBasePath(requestBasePath(request.headers));
    const url = new URL(withBasePath("/auth/reset-password", basePath), publicUrl.origin);
    url.searchParams.set("token", createPasswordResetToken(user));

    const brand = await getBrandConfig();
    await sendTransactionalEmail({
      to: user.email,
      subject: "Reset your " + brand.name + " password",
      text: "We received a request to reset your password. Open this link:\n" +
        url.toString() + "\n\nThe link expires in 30 minutes. If this was not you, ignore this email.",
      html: "<p>We received a request to reset your " + escapeHtml(brand.name) +
        " password.</p><p><a href=\"" + escapeHtml(url.toString()) +
        "\">Reset password</a></p><p>This link expires in 30 minutes. If this was not you, ignore this email.</p>",
    });
  } catch (error) {
    // Do not log the address, token, link, body, or provider response.
    console.error("Password reset delivery unavailable", error instanceof Error ? error.name : "unknown");
  }
}

/** Atomic compare-and-swap prevents concurrent replays from resetting twice. */
export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const userId = resetTokenUserId(token);
  if (!userId || password.length < 6 || password.length > 128) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, password: true } });
  if (!user || !verifyPasswordResetToken(token, user)) return false;
  const passwordHash = await bcrypt.hash(password, 10);
  const changed = await prisma.user.updateMany({
    where: { id: user.id, password: user.password },
    data: { password: passwordHash },
  });
  return changed.count === 1;
}
