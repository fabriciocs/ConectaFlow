/**
 * Isolated MySQL schema on Windows, no Docker. Preserve existing databases.
 * Explicit local opt-in is mandatory. Never drops a database.
 */
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!process.argv.includes("--create-isolated") || process.cwd().toLowerCase() !== root.toLowerCase()) {
  console.error("STATUS=BLOCKED;REASON=EXPLICIT_LOCAL_ISOLATION_OPT_IN_REQUIRED");
  process.exit(2);
}
const dbUrl = new URL(process.env.DATABASE_URL || "mysql://localhost/");
if (dbUrl.protocol !== "mysql:" || !["127.0.0.1", "localhost"].includes(dbUrl.hostname)
    || (dbUrl.port && dbUrl.port !== "3306") || dbUrl.pathname !== "/wa_akg") {
  console.error("STATUS=BLOCKED;REASON=EXPECTED_LOCAL_V1_DATABASE_REQUIRED");
  process.exit(2);
}
const schemaName = "wa_akg_sandbox_native_" + Date.now().toString(36) + "_" + randomBytes(3).toString("hex");
const evidenceRoot = path.join(root, ".remote-desktop", "sessions", "native-isolation-" + schemaName);
const raw = path.join(evidenceRoot, "raw");
mkdirSync(raw, { recursive: true });
const validation = { schemaName, status: "BLOCKED", created: false, bootstrap: "NOT_RUN", fixture: "NOT_RUN", checks: 0, persistent: true };
const prisma = new PrismaClient();
try {
  const current = await prisma.$queryRawUnsafe("SELECT DATABASE() AS name");
  if (current?.[0]?.name !== "wa_akg") throw new Error("DATABASE_TARGET_MISMATCH");
  const tick = String.fromCharCode(96);
  await prisma.$executeRawUnsafe("CREATE DATABASE " + tick + schemaName + tick + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  validation.created = true;
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
  validation.error = "ISOLATED_SCHEMA_CREATION_FAILED_" + code;
} finally {
  await prisma.$disconnect();
}
const sanitize = value => String(value || "").replaceAll(process.env.DATABASE_URL || "(none)", "[DB_URL]")
  .replace(/mysql:\/\/[^\s]+/gi, "[DB_URL]");
function run(label, args, env, timeoutMs) {
  const r = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: "utf8", timeout: timeoutMs,
    windowsHide: true, maxBuffer: 3 * 1024 * 1024,
  });
  writeFileSync(path.join(raw, label + ".stdout.log"), sanitize(r.stdout));
  writeFileSync(path.join(raw, label + ".stderr.log"), sanitize(r.stderr));
  return r;
}
if (validation.created) {
  const testUrl = new URL(dbUrl);
  testUrl.pathname = "/" + schemaName;
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), WA_AKG_ISOLATION_BACKEND: "native-mysql",
    WA_AKG_SYNTHETIC_ISOLATION: "1", DISABLE_TELEMETRY: "true", PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  const bootstrap = run("bootstrap", ["scripts/prisma-bootstrap-v2.mjs", "--deploy", "--expect-db", schemaName, "--confirm-empty-v2"], env, 180000);
  validation.bootstrap = bootstrap.status === 0 && String(bootstrap.stdout).includes('"resultingLineage":"v2"') ? "VERIFIED" : "FAILED";
  if (validation.bootstrap === "VERIFIED") {
    const fixture = run("fixture", ["node_modules/tsx/dist/cli.mjs", "scripts/integration/tenant-isolation.fixture.ts"], env, 120000);
    const resultLine = String(fixture.stdout ?? "").split(/\r?\n/).find(x => x.includes('"status":"VERIFIED"'));
    if (fixture.status === 0 && resultLine) {
      const result = JSON.parse(resultLine);
      validation.fixture = result.status;
      validation.checks = result.checks;
    } else validation.fixture = "FAILED";
  }
  validation.status = validation.bootstrap === "VERIFIED" && validation.fixture === "VERIFIED" && validation.checks >= 29 ? "VERIFIED" : "FAILED";
}
const resultPath = path.join(evidenceRoot, "validation.json");
writeFileSync(resultPath, JSON.stringify(validation, null, 2) + "\n");
const hashes = [];
for (const f of ["bootstrap.stdout.log", "bootstrap.stderr.log", "fixture.stdout.log", "fixture.stderr.log"]) {
  try { hashes.push(createHash("sha256").update(readFileSync(path.join(raw, f))).digest("hex") + "  raw/" + f); } catch {}
}
hashes.push(createHash("sha256").update(readFileSync(resultPath)).digest("hex") + "  validation.json");
writeFileSync(path.join(evidenceRoot, "checksums.sha256"), hashes.join("\n") + "\n");
console.log("STATUS=" + validation.status + ";SCHEMA=" + schemaName + ";CREATED=" + validation.created +
  ";BOOTSTRAP=" + validation.bootstrap + ";FIXTURE=" + validation.fixture + ";CHECKS=" + validation.checks +
  ";EVIDENCE=" + evidenceRoot);
if (validation.error) console.error(validation.error);
if (validation.status !== "VERIFIED") process.exitCode = 1;
