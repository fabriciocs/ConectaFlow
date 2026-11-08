import { createHash, createHmac, randomBytes } from "node:crypto";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { checkOAuthRateLimitDistributed, trustedProxyClientIp } from "@/lib/oauth/dcr-rate-limit";
import { normalizeBasePath, withBasePath } from "@/lib/base-path";

const TOKEN_TTL_MS = 10 * 60_000;

export class ChannelLinkError extends Error {
  constructor(readonly code: "DISABLED" | "INVALID" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE") {
    super(code);
  }
}

export function isChannelLinkingEnabled() {
  return process.env.CHANNEL_IDENTITY_LINKING_ENABLED === "true";
}

function hmacSecret() {
  const value = process.env.CHANNEL_IDENTITY_HMAC_KEY;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new ChannelLinkError("UNAVAILABLE");
  }
  return value;
}

export function canonicalWhatsAppSubject(jid: string): string | null {
  let canonical: string;
  try { canonical = jidNormalizedUser(normalizeJid(jid.trim())); } catch { return null; }
  if (canonical.length > 255 || !/^\d{5,20}@s\.whatsapp\.net$/.test(canonical)) return null;
  return canonical;
}

function hashSubject(jid: string) {
  return createHmac("sha256", hmacSecret()).update("v1.").update(jid).digest("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function configuredPublicOrigin() {
  const configured = process.env.BASE_URL || process.env.OAUTH_ISSUER_URL;
  if (!configured) throw new ChannelLinkError("UNAVAILABLE");
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
      throw new Error("Invalid public origin");
    }
    return { origin: url.origin, basePath: normalizeBasePath(url.pathname) };
  } catch {
    throw new ChannelLinkError("UNAVAILABLE");
  }
}

export function channelLinkOriginMatches(request: Request) {
  const { origin } = configuredPublicOrigin();
  return request.headers.get("origin") === origin;
}

export async function checkChannelChallengeQuota(subjectHash: string, request: Request) {
  const [bySubject, byIp] = await Promise.all([
    checkOAuthRateLimitDistributed("channel-link-subject", subjectHash, { limit: 3, windowMs: 60 * 60_000 }),
    checkOAuthRateLimitDistributed("channel-link-origin", trustedProxyClientIp(request), { limit: 30, windowMs: 60 * 60_000 }),
  ]);
  return bySubject.allowed && byIp.allowed;
}

/**
 * Issues a one-time challenge only for an active server-side WhatsApp session.
 * The caller must be the trusted inbound integration; tenant and receiving
 * account are always loaded from the session row.
 */
export async function issueChannelLinkChallenge(input: {
  sessionId: string;
  jid: string;
  requestId?: string | null;
  request: Request;
}) {
  if (!isChannelLinkingEnabled()) throw new ChannelLinkError("DISABLED");
  const subject = canonicalWhatsAppSubject(input.jid);
  if (!subject) throw new ChannelLinkError("INVALID");

  const session = await prisma.session.findUnique({
    where: { sessionId: input.sessionId },
    select: { id: true, sessionId: true, tenantId: true, status: true, tenant: { select: { status: true } } },
  });
  if (!session?.tenantId || session.status !== "CONNECTED" || session.tenant?.status !== "ACTIVE") {
    throw new ChannelLinkError("INVALID");
  }

  const subjectHash = hashSubject(subject);
  if (!(await checkChannelChallengeQuota(subjectHash, input.request))) throw new ChannelLinkError("RATE_LIMITED");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  const requestId = input.requestId ? createHash("sha256").update(input.requestId).digest("hex") : null;
  await prisma.$transaction(async (tx) => {
    await tx.channelLinkChallenge.updateMany({
      where: {
        tenantId: session.tenantId!, sessionId: session.id, subjectHash,
        purpose: "LINK_IDENTITY", consumedAt: null, revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await tx.channelLinkChallenge.create({
      data: {
        tenantId: session.tenantId!, sessionId: session.id,
        channelAccountId: session.sessionId, subjectHash, tokenHash: hashToken(token),
        expiresAt, requestId,
      },
    });
    await tx.auditEvent.create({ data: {
      tenantId: session.tenantId, action: "LINK_REQUESTED", outcome: "SUCCESS",
      resourceType: "ChannelLinkChallenge", requestId,
    } });
  });

  const { origin, basePath } = configuredPublicOrigin();
  const url = new URL(withBasePath("/auth/channel-link", basePath), origin);
  url.searchParams.set("token", token);
  return { url: url.toString(), expiresAt };
}

export async function completeChannelLink(token: string, userId: string) {
  if (!isChannelLinkingEnabled()) throw new ChannelLinkError("DISABLED");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ChannelLinkError("INVALID");
  const tokenHash = hashToken(token);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const challenge = await tx.channelLinkChallenge.findUnique({ where: { tokenHash } });
      if (!challenge || challenge.expiresAt <= now || challenge.consumedAt || challenge.revokedAt) {
        throw new ChannelLinkError("INVALID");
      }
      const receivingSession = await tx.session.findFirst({
        where: { id: challenge.sessionId, sessionId: challenge.channelAccountId,
          tenantId: challenge.tenantId, status: "CONNECTED", tenant: { status: "ACTIVE", suspendedAt: null } },
        select: { id: true },
      });
      if (!receivingSession) throw new ChannelLinkError("INVALID");
      const membership = await tx.tenantMembership.findFirst({
        where: {
          tenantId: challenge.tenantId, userId, status: "ACTIVE", revokedAt: null,
          tenant: { status: "ACTIVE", suspendedAt: null },
        },
        select: { tenantId: true },
      });
      if (!membership) throw new ChannelLinkError("INVALID");

      const consumed = await tx.channelLinkChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now, userId },
      });
      if (consumed.count !== 1) throw new ChannelLinkError("INVALID");
      await tx.auditEvent.create({ data: {
        actorUserId: userId, tenantId: challenge.tenantId, action: "LINK_AUTHENTICATED", outcome: "SUCCESS",
        resourceType: "ChannelLinkChallenge", resourceId: challenge.id, requestId: challenge.requestId,
      } });

      const scope = {
        tenantId: challenge.tenantId, channel: challenge.channel,
        channelAccountId: challenge.channelAccountId, subjectHash: challenge.subjectHash,
      };
      const previous = await tx.channelIdentityLink.findUnique({
        where: { tenantId_channel_channelAccountId_subjectHash: scope },
      });
      if (previous?.status === "ACTIVE" && (!previous.expiresAt || previous.expiresAt > now)) {
        if (previous.userId !== userId) throw new ChannelLinkError("CONFLICT");
        return { linkId: previous.id, alreadyLinked: true };
      }

      const link = previous
        ? await tx.channelIdentityLink.update({
          where: { id: previous.id },
          data: { userId, sessionId: challenge.sessionId, status: "ACTIVE", linkedAt: now,
            expiresAt: null, revokedAt: null, authTime: null, authMethod: "AUTHJS_BROWSER_SESSION" },
          select: { id: true },
        })
        : await tx.channelIdentityLink.create({
          data: { ...scope, userId, sessionId: challenge.sessionId, status: "ACTIVE",
            linkedAt: now, authMethod: "AUTHJS_BROWSER_SESSION" },
          select: { id: true },
        });
      await tx.auditEvent.create({ data: {
        actorUserId: userId, tenantId: challenge.tenantId, action: "LINK_CREATED", outcome: "SUCCESS",
        resourceType: "ChannelIdentityLink", resourceId: link.id, requestId: challenge.requestId,
      } });
      return { linkId: link.id, alreadyLinked: false };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof ChannelLinkError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new ChannelLinkError("CONFLICT");
    }
    throw new ChannelLinkError("UNAVAILABLE");
  }
}

export type ChannelPrincipalContext = {
  tenantId: string;
  receivingSessionId: string;
  senderJid: string;
};

export type ChannelPrincipal =
  | { kind: "PUBLIC" }
  | { kind: "DENY"; reason: "INVALID_CONTEXT" | "MEMBERSHIP_INACTIVE" }
  | { kind: "LINKED_USER"; userId: string; linkId: string; tenantId: string; sessionId: string };

/** Resolve a link only from a server-validated tenant/session context. */
export async function resolveChannelPrincipal(context: ChannelPrincipalContext): Promise<ChannelPrincipal> {
  if (!isChannelLinkingEnabled()) return { kind: "PUBLIC" };
  const subject = canonicalWhatsAppSubject(context.senderJid);
  if (!subject) return { kind: "PUBLIC" };
  let subjectHash: string;
  try { subjectHash = hashSubject(subject); } catch { return { kind: "DENY", reason: "INVALID_CONTEXT" }; }

  const session = await prisma.session.findFirst({
    where: { sessionId: context.receivingSessionId, tenantId: context.tenantId, status: "CONNECTED", tenant: { status: "ACTIVE" } },
    select: { id: true, sessionId: true },
  });
  if (!session) return { kind: "DENY", reason: "INVALID_CONTEXT" };

  const now = new Date();
  const link = await prisma.channelIdentityLink.findFirst({
    where: { tenantId: context.tenantId, sessionId: session.id, channel: "WHATSAPP", channelAccountId: session.sessionId,
      subjectHash, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, userId: true },
  });
  if (!link) return { kind: "PUBLIC" };

  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId: context.tenantId, userId: link.userId, status: "ACTIVE", revokedAt: null,
      tenant: { status: "ACTIVE", suspendedAt: null }, user: { emailVerified: true } },
    select: { userId: true },
  });
  if (!membership) return { kind: "DENY", reason: "MEMBERSHIP_INACTIVE" };
  return { kind: "LINKED_USER", userId: link.userId, linkId: link.id,
    tenantId: context.tenantId, sessionId: session.sessionId };
}

/** A link identifies a user; a separate owner/grant check still decides resource access. */
export async function authorizeChannelResource(input: ChannelPrincipalContext & {
  resourceTenantId: string | null;
  resourceType: string;
  resourceId: string;
  ownerUserId: string;
  capability: "READ" | "WRITE" | "DELETE";
}) {
  const principal = await resolveChannelPrincipal(input);
  if (principal.kind !== "LINKED_USER" || input.resourceTenantId !== input.tenantId) return false;
  if (principal.userId === input.ownerUserId) return true;
  const grant = await prisma.resourceGrant.findFirst({
    where: { tenantId: input.tenantId, resourceType: input.resourceType, resourceId: input.resourceId,
      principalUserId: principal.userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { capabilities: true },
  });
  return Array.isArray(grant?.capabilities) && grant.capabilities.includes(input.capability);
}

export async function revokeChannelLink(input: { id: string; tenantId: string; userId: string }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.channelIdentityLink.updateMany({
      where: { id: input.id, tenantId: input.tenantId, userId: input.userId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    if (updated.count) await tx.auditEvent.create({ data: {
      actorUserId: input.userId, tenantId: input.tenantId, action: "LINK_REVOKED", outcome: "SUCCESS",
      resourceType: "ChannelIdentityLink", resourceId: input.id,
    } });
    return updated.count > 0;
  });
}
