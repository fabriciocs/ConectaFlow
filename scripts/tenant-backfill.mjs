import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const migration = "20261103190500_additive_multi_tenancy";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const personalId = (userId) => `personal-${hash(userId).slice(0, 32)}`;
const personalSql = (user) => `CONCAT('personal-', LEFT(SHA2(${user}.id, 256), 32))`;
const legacyUser = (user) => `${user}.createdAt < (SELECT MAX(finished_at) FROM _prisma_migrations
  WHERE migration_name = '${migration}' AND rolled_back_at IS NULL)`;
const personalTenant = (user) => `CASE WHEN ${legacyUser(user)} THEN ${personalSql(user)} END`;
const sessionTenant = `CASE
  WHEN s.tenantId IS NULL THEN ${personalTenant("u")}
  WHEN t.status = 'ACTIVE' AND m.status = 'ACTIVE' AND m.revokedAt IS NULL THEN s.tenantId
END`;
const scopedSession = (relationship) => `
  LEFT JOIN Session s ON ${relationship}
  LEFT JOIN User u ON u.id = s.userId
  LEFT JOIN Tenant t ON t.id = s.tenantId
  LEFT JOIN TenantMembership m ON m.tenantId = s.tenantId AND m.userId = s.userId`;
const expectedIf = (condition) => `CASE WHEN ${condition} THEN (${sessionTenant}) END`;
const parentTenantMatches = (alias) => `(${alias}.tenantId IS NULL OR ${alias}.tenantId = (${sessionTenant}))`;

// Rules follow the persisted relation, rather than guessing from a JID,
// filename, account role or similarity between internal and public IDs.
const rules = [
  ["Session", "id", "LEFT JOIN User u ON u.id = r.userId", personalTenant("u")],
  ...["Contact", "Message", "Group", "Story", "BotConfig", "AutoReply", "ScheduledMessage"]
    .map((table) => [table, "id", scopedSession("s.id = r.sessionId"), sessionTenant]),
  ...["AuthState", "BroadcastLog", "WhatsAppSendThrottle", "WhatsAppSessionLease"]
    .map((table) => [
      table, table.startsWith("WhatsApp") ? "sessionId" : "id",
      scopedSession("s.sessionId = r.sessionId"), sessionTenant,
    ]),
  ["ProcessingResult", "id",
    scopedSession("s.id = r.sessionId") + " LEFT JOIN Message msg ON msg.id = r.messageId",
    expectedIf(`r.sessionPublicId = s.sessionId AND
      (r.messageId IS NULL OR (msg.sessionId = s.id AND ${parentTenantMatches("msg")}))`)],
  ["InboundEvent", "id", scopedSession("s.id = r.sessionId") +
    " LEFT JOIN Message msg ON msg.id = r.messageId LEFT JOIN ProcessingResult p ON p.resultId = r.resultId",
    expectedIf(`(r.messageId IS NULL OR (msg.sessionId = s.id AND ${parentTenantMatches("msg")}))
      AND (r.resultId IS NULL OR (p.sessionId = s.id AND p.sessionPublicId = s.sessionId
        AND ${parentTenantMatches("p")}))`)],
  ["OutboundMessageOperation", "id", scopedSession("s.id = r.sessionDbId"),
    expectedIf("r.userId = s.userId AND r.whatsappSessionId = s.sessionId")],
  ["BroadcastRecipient", "id", "LEFT JOIN BroadcastLog b ON b.id = r.broadcastLogId " +
    scopedSession("s.sessionId = b.sessionId"), expectedIf(parentTenantMatches("b"))],
  ["SessionAccess", "id", scopedSession("s.id = r.sessionId"), expectedIf("r.userId = s.userId")],
  ["Notification", "id", "LEFT JOIN User u ON u.id = r.userId", personalTenant("u")],
  ["Webhook", "id", scopedSession("s.id = r.sessionId") + " LEFT JOIN User owner ON owner.id = r.userId",
    `CASE WHEN r.sessionId IS NULL THEN (${personalTenant("owner")})
      WHEN r.userId = s.userId THEN (${sessionTenant}) END`],
  ["WebhookLog", "id", "LEFT JOIN Webhook w ON w.id = r.webhookId " +
    scopedSession("s.id = w.sessionId") + ` LEFT JOIN User owner ON owner.id = w.userId
    LEFT JOIN Tenant wt ON wt.id = w.tenantId
    LEFT JOIN TenantMembership wm ON wm.tenantId = w.tenantId AND wm.userId = w.userId`,
    `CASE
      WHEN w.sessionId IS NULL AND wt.status = 'ACTIVE' AND wm.status = 'ACTIVE'
        AND wm.revokedAt IS NULL THEN w.tenantId
      WHEN w.sessionId IS NULL AND w.tenantId IS NULL THEN (${personalTenant("owner")})
      WHEN w.userId = s.userId AND ${parentTenantMatches("w")} THEN (${sessionTenant})
    END`],
];

// The legacy OAuth data remains intact. Re-consent must establish its tenant,
// session grants and token audience explicitly rather than broadening old credentials.
const unassignedCredentials = [
  "OAuthClient", "OAuthAuthorizationRequest", "OAuthAuthorizationCode", "OAuthAccessToken",
  "OAuthRefreshToken", "OAuthGrant", "OAuthGrantSessionCapability",
];
const identifier = (name) => `\`${name}\``;

function options() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== "mysql:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) {
    throw new Error("LOOPBACK_MYSQL_REQUIRED");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error("DATABASE_NAME_INVALID");
  const [apply, expected, operator, ...extra] = process.argv.slice(2);
  if (!apply) return { database };
  if (apply !== `--apply=${database}` || !/^--expect=[a-f0-9]{64}$/.test(expected)
    || !/^--operator=[A-Za-z0-9._-]{1,64}$/.test(operator) || extra.length) {
    throw new Error("EXACT_DATABASE_PLAN_AND_OPERATOR_REQUIRED");
  }
  return { database, fingerprint: expected.slice(9), operator: operator.slice(11) };
}

async function inspectLabels(tx, digest) {
  const matches = (session, label) =>
    `(BINARY ${session}.id = BINARY ${label}.sessionId
      OR BINARY ${session}.sessionId = BINARY ${label}.sessionId)`;
  // Old HTTP writers accepted both session identifiers. An exact match in
  // each namespace must resolve to the same session to establish ownership.
  const uniqueSession = `${matches("s", "r")} AND NOT EXISTS (
    SELECT 1 FROM Session otherSession
    WHERE BINARY otherSession.id <> BINARY s.id
      AND (${matches("otherSession", "r")} OR BINARY otherSession.id = BINARY s.sessionId)
  )`;
  const labels = await tx.$queryRawUnsafe(`
    WITH resolvedLabels AS (
      SELECT r.id, r.name, r.sessionId AS sourceSessionId, r.tenantId AS sourceTenantId,
        s.sessionId AS sessionPublicId, s.tenantId AS storedSessionTenantId, ${sessionTenant} AS tenantId
      FROM Label r ${scopedSession(uniqueSession)}
    )
    SELECT candidate.id, candidate.sourceSessionId, candidate.sourceTenantId,
      candidate.sessionPublicId, candidate.storedSessionTenantId, candidate.tenantId, EXISTS (
        SELECT 1 FROM resolvedLabels other
        WHERE other.id <> candidate.id AND other.name = candidate.name
          AND (other.sourceSessionId = candidate.sessionPublicId OR other.sessionPublicId = candidate.sessionPublicId)
      ) AS nameCollision
    FROM resolvedLabels candidate ORDER BY candidate.id
  `);
  const safeLabels = new Map();
  const inactiveLabels = new Map();
  const labelRows = [];
  let unassignedLabels = 0;
  for (const { id, sourceSessionId, sourceTenantId, sessionPublicId, storedSessionTenantId, tenantId, nameCollision } of labels) {
    const alreadyCanonical = sourceTenantId !== null && sourceSessionId === sessionPublicId;
    const safe = Boolean(tenantId) && (sourceTenantId === null || sourceTenantId === tenantId)
      && (!Number(nameCollision) || alreadyCanonical);
    digest.update(JSON.stringify(["Label", id, sourceSessionId, sourceTenantId, sessionPublicId,
      storedSessionTenantId, tenantId, Boolean(Number(nameCollision)), safe]));
    if (!safe) {
      // Inactive sessions are out of scope for new assignments. A known
      // existing binding may still validate its already-bound children.
      if (tenantId === null && sourceTenantId !== null && sourceTenantId === storedSessionTenantId) {
        inactiveLabels.set(id, sourceTenantId);
        if (!alreadyCanonical) unassignedLabels++;
        continue;
      }
      if (sourceTenantId !== null) throw new Error("SCOPED_LABEL_REQUIRES_REVIEW");
      unassignedLabels++;
      continue;
    }
    safeLabels.set(id, tenantId);
    if (!alreadyCanonical) labelRows.push({ id, tenantId, sourceTenantId, sourceSessionId, sessionPublicId });
  }

  const chatLabels = await tx.$queryRaw`
    SELECT r.id, r.tenantId AS sourceTenantId, l.id AS labelId
    FROM ChatLabel r LEFT JOIN Label l ON l.id = r.labelId ORDER BY r.id
  `;
  const chatLabelRows = [];
  let unassignedChatLabels = 0;
  for (const { id, sourceTenantId, labelId } of chatLabels) {
    const tenantId = safeLabels.get(labelId) ?? null;
    digest.update(JSON.stringify(["ChatLabel", id, sourceTenantId, labelId, tenantId]));
    if (sourceTenantId !== null) {
      if (sourceTenantId !== (tenantId ?? inactiveLabels.get(labelId))) {
        throw new Error("SCOPED_CHAT_LABEL_REQUIRES_REVIEW");
      }
    } else if (tenantId === null) {
      unassignedChatLabels++;
    } else {
      chatLabelRows.push({ id, tenantId });
    }
  }

  return [
    { table: "Label", rows: labelRows, unassigned: unassignedLabels },
    { table: "ChatLabel", rows: chatLabelRows, unassigned: unassignedChatLabels },
  ];
}

async function inspect(tx, database) {
  const [schema] = await tx.$queryRaw`
    SELECT MAX(finished_at) AS finishedAt FROM _prisma_migrations
    WHERE migration_name = ${migration} AND rolled_back_at IS NULL
  `;
  if (!schema.finishedAt) throw new Error("ADDITIVE_MIGRATION_REQUIRED");
  const users = await tx.user.findMany({
    where: { createdAt: { lt: schema.finishedAt } }, select: { id: true }, orderBy: { id: "asc" },
  });
  const personal = users.map(({ id }) => ({ userId: id, tenantId: personalId(id) }));
  const tenants = await tx.tenant.findMany({
    where: { OR: [{ id: { in: personal.map((row) => row.tenantId) } },
      { slug: { in: personal.map((row) => row.tenantId) } }] },
    select: { id: true, slug: true, status: true, memberships: {
      where: { role: "OWNER" }, select: { userId: true, status: true, revokedAt: true },
    } },
  });
  const missing = personal.filter(({ userId, tenantId }) => {
    const matches = tenants.filter(({ id, slug }) => id.toLowerCase() === tenantId || slug.toLowerCase() === tenantId);
    if (!matches.length) return true;
    const [tenant] = matches;
    if (matches.length !== 1 || tenant.id !== tenantId || tenant.slug !== tenantId
      || tenant.status !== "ACTIVE" || tenant.memberships.length !== 1
      || !tenant.memberships.some((member) => member.userId === userId
        && member.status === "ACTIVE" && !member.revokedAt)) throw new Error("PERSONAL_TENANT_CONFLICT");
    return false;
  });
  const planned = [];
  const digest = createHash("sha256").update(JSON.stringify({ database, missing }));
  for (const [table, key, joins, expression] of rules) {
    const source = `FROM ${identifier(table)} r ${joins} WHERE r.tenantId IS NULL`;
    const [count] = await tx.$queryRawUnsafe(`SELECT COUNT(*) AS total ${source}`);
    const rows = await tx.$queryRawUnsafe(
      `SELECT r.${key} AS id, ${expression} AS tenantId ${source} AND (${expression}) IS NOT NULL ORDER BY r.${key}`,
    );
    digest.update(JSON.stringify([table, rows, Number(count.total)]));
    planned.push({ table, joins, expression, rows, unassigned: Number(count.total) - rows.length });
  }
  planned.push(...await inspectLabels(tx, digest));
  const credentialCounts = {};
  for (const table of unassignedCredentials) {
    const [count] = await tx.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM ${identifier(table)} WHERE tenantId IS NULL`);
    credentialCounts[table] = Number(count.total);
  }
  digest.update(JSON.stringify(credentialCounts));
  return { missing, planned, credentialCounts, fingerprint: digest.digest("hex") };
}

async function applyPlan(tx, plan, operator) {
  const requestId = randomUUID();
  const assigned = new Map();
  for (const { userId, tenantId } of plan.missing) {
    await tx.tenant.create({
      data: { id: tenantId, slug: tenantId, name: "Personal",
        memberships: { create: { userId, role: "OWNER" } } },
    });
    assigned.set(tenantId, { personalTenants: 1 });
  }
  for (const { table, joins, expression, rows } of plan.planned) {
    if (!rows.length) continue;
    let changed = 0;
    if (table === "Label") {
      for (const { id, tenantId, sourceTenantId, sourceSessionId, sessionPublicId } of rows) {
        changed += await tx.$executeRaw`
          UPDATE Label SET tenantId = ${tenantId}, sessionId = ${sessionPublicId}
          WHERE id = ${id} AND tenantId <=> ${sourceTenantId} AND BINARY sessionId = BINARY ${sourceSessionId}
        `;
      }
    } else if (table === "ChatLabel") {
      for (const { id, tenantId } of rows) {
        changed += await tx.$executeRaw`
          UPDATE ChatLabel SET tenantId = ${tenantId} WHERE id = ${id} AND tenantId IS NULL
        `;
      }
    } else {
      changed = await tx.$executeRawUnsafe(
        `UPDATE ${identifier(table)} r ${joins} SET r.tenantId = (${expression})
          WHERE r.tenantId IS NULL AND (${expression}) IS NOT NULL`,
      );
    }
    if (changed !== rows.length) throw new Error("PLAN_CHANGED_DURING_UPDATE");
    for (const { tenantId } of rows) {
      if (!assigned.has(tenantId)) assigned.set(tenantId, {});
      const counts = assigned.get(tenantId);
      counts[table] = (counts[table] ?? 0) + 1;
    }
  }
  for (const [tenantId, counts] of assigned) {
    await tx.auditEvent.create({
      data: {
        tenantId, action: "LEGACY_TENANT_BACKFILL", outcome: "APPLIED", requestId,
        reason: "Assign legacy records from verified ownership relationships",
        metadata: { operator, plan: plan.fingerprint, counts },
      },
    });
  }
  return requestId;
}

let prisma;
try {
  const { database, fingerprint, operator } = options();
  prisma = new PrismaClient();
  const result = await prisma.$transaction(async (tx) => {
    const plan = await inspect(tx, database);
    if (fingerprint && plan.fingerprint !== fingerprint) throw new Error("PLAN_MISMATCH");
    const requestId = fingerprint ? await applyPlan(tx, plan, operator) : null;
    return {
      status: fingerprint ? "APPLIED" : "READ_ONLY_PLAN", database, requestId,
      fingerprint: plan.fingerprint, personalTenantsToCreate: plan.missing.length,
      counts: Object.fromEntries(plan.planned.map(({ table, rows, unassigned }) =>
        [table, { assignedByRule: rows.length, leftUnassigned: unassigned }])),
      legacyCredentialsLeftUnassigned: plan.credentialCounts,
    };
  }, { isolationLevel: "Serializable", timeout: 120_000 });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = typeof error.message === "string" && /^[A-Z_]+$/.test(error.message);
  console.error(JSON.stringify({ status: "BLOCKED", reason: known ? error.message : error.code ?? "BACKFILL_FAILED" }));
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
