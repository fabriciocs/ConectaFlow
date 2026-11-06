/**
 * WA-AKG Prisma migration router V2.
 * Defaults to read-only inspection. Never reconciles existing databases.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1_MIGRATIONS = path.join(ROOT, "prisma", "migrations");
const V2_ROOT = path.join(ROOT, "prisma", "bootstrap-v2");
const MANIFEST_PATH = path.join(V2_ROOT, "manifest.json");
const CANONICAL_SCHEMA = path.join(ROOT, "prisma", "schema.prisma");

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseDatabaseName(rawUrl) {
  if (!rawUrl) throw new Error("DATABASE_URL ausente");
  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error("DATABASE_URL invalida"); }
  if (parsed.protocol !== "mysql:") throw new Error("Apenas MySQL e suportado");
  const db = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(db)) throw new Error("Nome do banco nao suportado");
  return db;
}

export function lineageFor(tableNames, migrations, baselineName) {
  if (tableNames.length === 0) return "empty";
  if (!tableNames.some((name) => name.toLowerCase() === "_prisma_migrations")) return "unmanaged";
  const names = migrations.map((item) => item.migration_name);
  const hasV2 = names.includes(baselineName);
  const hasV1 = names.includes("20261024000000_baseline");
  if (hasV2 && hasV1) return "mixed";
  if (hasV2) return "v2";
  if (hasV1) return "v1";
  return "unknown";
}

function parseArgs(argv) {
  const opts = { deploy: false, expectedDb: null, confirmEmpty: false, allowLegacy: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--deploy") opts.deploy = true;
    else if (arg === "--expect-db" && argv[i + 1]) opts.expectedDb = argv[++i];
    else if (arg === "--confirm-empty-v2") opts.confirmEmpty = true;
    else if (arg === "--allow-legacy-deploy") opts.allowLegacy = true;
    else throw new Error("Argumento nao reconhecido");
  }
  return opts;
}

function checkManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const schemaHash = sha256(readFileSync(CANONICAL_SCHEMA));
  const migrationPath = path.join(V2_ROOT, "migrations", manifest.migrationName, "migration.sql");
  const baselineHash = sha256(readFileSync(migrationPath));
  if (manifest.schemaSha256 !== schemaHash) {
    throw new Error("SCHEMA_CHANGED: criar revisao de migracao V1/V2 antes de prosseguir");
  }
  if (manifest.baselineSha256 !== baselineHash) {
    throw new Error("BASELINE_CHANGED: SQL V2 imutavel foi modificado");
  }
  if (!/^2\.\d+\.\d+$/.test(manifest.schemaVersion)) throw new Error("Versao do manifesto nao suportada");
  return manifest;
}

export function checkRecordedHashes(rows, migrationsPath) {
  const mismatches = [];
  const appliedNames = new Set(
    rows.filter((item) => item.finished_at && !item.rolled_back_at).map((item) => item.migration_name)
  );
  for (const item of rows) {
    if (!/^\d{14}_[a-zA-Z0-9_]+$/.test(item.migration_name)) {
      mismatches.push({ migration: "[invalid_name]", reason: "invalid_name" });
      continue;
    }
    // Prisma retains failed attempts after a rollback and a successful replay.
    // The applied row still has to pass the normal checksum validation.
    if (item.rolled_back_at && !item.finished_at && appliedNames.has(item.migration_name)) continue;
    if (!item.finished_at || item.rolled_back_at) {
      mismatches.push({ migration: item.migration_name, reason: "not_finished" });
      continue;
    }
    const file = path.join(migrationsPath, item.migration_name, "migration.sql");
    if (!existsSync(file) || item.checksum !== sha256(readFileSync(file))) {
      mismatches.push({ migration: item.migration_name, reason: "checksum_or_file" });
    }
  }
  return mismatches;
}

function prismaBinary() {
  // Invoke the installed Prisma JS entrypoint directly; cmd.exe quoting is
  // unreliable on Windows Node 24 and shell execution is unnecessary.
  const p = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(p)) throw new Error("Prisma CLI local nao instalado");
  return p;
}

function runPrisma(args) {
  const binary = prismaBinary();
  const options = { cwd: ROOT, env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" }, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024 };
  const result = spawnSync(process.execPath, [binary, ...args], options);
  const output = String(result.stdout ?? "") + String(result.stderr ?? "");
  // Deliberately never emit full Prisma output (it may contain connection details).
  return { exitCode: result.status ?? 1, output, spawnError: result.error?.code ?? null };
}

function stageV2() {
  const dir = mkdtempSync(path.join(tmpdir(), "wa-akg-prisma-v2-"));
  copyFileSync(CANONICAL_SCHEMA, path.join(dir, "schema.prisma"));
  cpSync(path.join(V2_ROOT, "migrations"), path.join(dir, "migrations"), { recursive: true });
  return { dir, schema: path.join(dir, "schema.prisma") };
}

async function inspect(prisma, manifest) {
  const currentDbRows = await prisma.$queryRawUnsafe("SELECT DATABASE() AS name");
  const actualDb = currentDbRows[0]?.name;
  const tableRows = await prisma.$queryRawUnsafe(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
  );
  const names = tableRows.map((row) => row.name);
  const hasLedger = names.some((name) => name.toLowerCase() === "_prisma_migrations");
  const migrations = hasLedger ? await prisma.$queryRawUnsafe(
    "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations"
  ) : [];
  const lineage = lineageFor(names, migrations, manifest.migrationName);
  const directory = lineage === "v2" ? path.join(V2_ROOT, "migrations") : V1_MIGRATIONS;
  const drift = lineage === "v1" || lineage === "v2"
    ? checkRecordedHashes(migrations, directory)
    : [];
  return { actualDb, tableCount: names.length, lineage, migrationCount: migrations.length, checksumErrors: drift };
}

async function run(argv) {
  const options = parseArgs(argv);
  const manifest = checkManifest();
  const expectedFromUrl = parseDatabaseName(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  let stage;
  try {
    const state = await inspect(prisma, manifest);
    if (state.actualDb !== expectedFromUrl) throw new Error("DATABASE_TARGET_MISMATCH");
    const report = {
      mode: options.deploy ? "deploy" : "inspect",
      database: state.actualDb, lineage: state.lineage,
      tableCount: state.tableCount, migrationCount: state.migrationCount,
      checksumErrors: state.checksumErrors,
      schemaVersion: manifest.schemaVersion,
    };
    if (!options.deploy) {
      console.log(JSON.stringify({ status: "INSPECTED", ...report }));
      return;
    }
    if (!options.expectedDb || options.expectedDb !== state.actualDb) {
      throw new Error("EXPECTED_DATABASE_REQUIRED");
    }
    if (state.checksumErrors.length) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
    if (["unmanaged", "mixed", "unknown"].includes(state.lineage)) throw new Error("UNMANAGED_OR_MIXED_DATABASE");
    if (state.lineage === "v1" && !options.allowLegacy) throw new Error("LEGACY_DEPLOY_REQUIRES_EXPLICIT_AUTHORIZATION");
    if (state.lineage === "empty" && !options.confirmEmpty) throw new Error("EMPTY_DATABASE_REQUIRES_EXPLICIT_V2_CONFIRMATION");
    if (state.lineage === "v1" && !state.migrationCount) throw new Error("LEGACY_HISTORY_INCOMPLETE");
    if (state.lineage === "v1") {
      // A legacy database still on the known broken initial migration must
      // be reconciled manually; a fresh DB must use V2, not the V1 chain.
      const ledger = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name = '20261031100000_add_inbound_event_message_id' AND finished_at IS NOT NULL"
      );
      if (Number(ledger[0]?.n) !== 1) throw new Error("LEGACY_HISTORY_REQUIRES_MANUAL_REVIEW");
    }

    // Disconnect before the migration process opens its own connections.
    await prisma.$disconnect();
    if (state.lineage !== "v1") stage = stageV2();
    const schema = state.lineage === "v1" ? CANONICAL_SCHEMA : stage.schema;
    const applied = runPrisma(["migrate", "deploy", "--schema", schema]);
    if (applied.exitCode !== 0) {
      const scrubbed = applied.output.replaceAll(process.env.DATABASE_URL ?? "[none]", "[DB_URL]")
        .replace(/mysql:\/\/[^\s]+/gi, "[DB_URL]").replace(/\s+/g, " ").trim().slice(0, 280);
      throw new Error("PRISMA_MIGRATE_DEPLOY_FAILED_" + applied.exitCode + "_" + (applied.spawnError ?? "no_spawn_error") + "_" + scrubbed);
    }
    const second = runPrisma(["migrate", "deploy", "--schema", schema]);
    if (second.exitCode !== 0) throw new Error("PRISMA_IDEMPOTENCE_FAILED_" + second.exitCode);
    const validated = new PrismaClient();
    try {
      const after = await inspect(validated, manifest);
      if (after.lineage !== state.lineage.replace("empty", "v2") || after.checksumErrors.length) {
        throw new Error("POST_DEPLOY_HISTORY_INVALID");
      }
      if (state.lineage !== "v1") {
        const diff = runPrisma([
          "migrate", "diff", "--from-schema-datasource", schema,
          "--to-schema-datamodel", CANONICAL_SCHEMA, "--exit-code",
        ]);
        if (diff.exitCode !== 0) throw new Error("POST_DEPLOY_SCHEMA_DIFF_" + diff.exitCode);
      }
      console.log(JSON.stringify({
        status: "VERIFIED", ...report, resultingLineage: after.lineage,
        migrationsAfter: after.migrationCount, secondDeployExit: second.exitCode,
        schemaDiffExit: state.lineage === "v1" ? "NOT_RUN" : 0,
      }));
    } finally { await validated.$disconnect(); }
  } finally {
    await prisma.$disconnect();
    if (stage) rmSync(stage.dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    const code = String(error?.message ?? "UNKNOWN").replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 100);
    console.error(JSON.stringify({ status: "BLOCKED", code }));
    process.exitCode = 1;
  });
}
