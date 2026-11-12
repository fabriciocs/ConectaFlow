import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { sendTransactionalEmail } from "@/lib/mail-delivery";
import { prisma } from "@/lib/prisma";
import { normalizeBasePath, withBasePath } from "@/lib/base-path";
import { getBrandConfig } from "@/lib/branding-server";
import { writeEmailVerificationLog } from "@/lib/email-verification-log";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const HOURLY_LIMIT = 3;
const DAILY_LIMIT = 10;

export function isVerificationResendAllowed(hourlyCount: number, dailyCount: number) {
  return hourlyCount < HOURLY_LIMIT && dailyCount < DAILY_LIMIT;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sendVerificationEmail(
  user: { id: string; email: string; name: string | null },
  requestUrl: URL,
  transportFactory: typeof nodemailer.createTransport = nodemailer.createTransport,
  requestBasePath = "",
  logWriter: typeof writeEmailVerificationLog = writeEmailVerificationLog,
  httpClient: typeof fetch = fetch,
) {
  const now = new Date();
  const [hourlyCount, dailyCount] = await Promise.all([
    prisma.emailVerificationToken.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    prisma.emailVerificationToken.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
  ]);
  if (!isVerificationResendAllowed(hourlyCount, dailyCount)) {
    await logWriter({ email: user.email, userId: user.id, status: "rate_limited" });
    return { sent: false, limited: true };
  }

  const token = randomBytes(32).toString("base64url");
  const record = await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
  });
  await logWriter({ email: user.email, userId: user.id, verificationId: record.id, status: "created", expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString() });
  const configuredPublicUrl = process.env.BASE_URL || process.env.OAUTH_ISSUER_URL;
  if (!configuredPublicUrl && process.env.NODE_ENV === "production") throw new Error("BASE_URL must be configured in production");
  const publicUrl = configuredPublicUrl ? new URL(configuredPublicUrl) : requestUrl;
  if (process.env.NODE_ENV === "production" && publicUrl.protocol !== "https:") throw new Error("Verification links require HTTPS in production");
  const configuredPath = normalizeBasePath(publicUrl.pathname) || normalizeBasePath(requestBasePath);
  const link = new URL(withBasePath("/auth/verify-email", configuredPath), publicUrl.origin);
  link.searchParams.set("token", token);

  try {
    const brand = await getBrandConfig();
    const escapedBrandName = escapeHtml(brand.name);
    await sendTransactionalEmail({
      to: user.email,
      subject: "Confirm your " + brand.name + " account",
      text: "Hello" + (user.name ? " " + user.name : "") + ",\n\nWelcome to " + brand.name + ". Confirm your email address by opening this link and choosing Confirm:\n" + link + "\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.",
      html: "<p>Hello" + (user.name ? " " + escapeHtml(user.name) : "") + ",</p><p>Welcome to " + escapedBrandName + ". Confirm your email address by opening this link and choosing <strong>Confirm</strong>:</p><p><a href=\"" + escapeHtml(link.toString()) + "\">Confirm email address</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>",
    }, transportFactory, httpClient, `verification-${record.id}`);
    await logWriter({ email: user.email, userId: user.id, verificationId: record.id, status: "sent" });
    return { sent: true, limited: false };
  } catch (error) {
    const localRecovery = process.env.NODE_ENV === "development" && process.env.EMAIL_VERIFICATION_LOCAL_RECOVERY === "true";
    if (!localRecovery) {
      await prisma.emailVerificationToken.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
    }
    await logWriter({ email: user.email, userId: user.id, verificationId: record.id, status: "delivery_failed", expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(), ...(localRecovery ? { recoveryUrl: link.toString() } : {}), errorCode: "EMAIL_DELIVERY_FAILED" });
    throw error;
  }
}

export async function consumeVerificationToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return "invalid" as const;
  const tokenHash = hash(token);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.consumedAt || record.expiresAt <= now) return "invalid" as const;
    const updated = await tx.user.updateMany({ where: { id: record.userId, emailVerified: false }, data: { emailVerified: true } });
    const consumed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
    });
    if (!consumed.count) return "invalid" as const;
    return updated.count ? "verified" as const : "already-verified" as const;
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
