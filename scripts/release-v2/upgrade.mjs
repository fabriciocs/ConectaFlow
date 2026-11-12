#!/usr/bin/env node
/**
 * ConectaFlow: read-only V1 -> V2 upgrade entrypoint.
 * Upgrade/resume/rollback are intentionally NOT implemented. Fail closed.
 * Node >=22, no external packages, no shell invocation, no environment values logged.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACTION = process.argv[2] ?? "help";
const MUTATIONS = new Set(["upgrade", "resume", "rollback", "prepare", "migrate", "activate"]);
const READ_ONLY = new Set(["help", "doctor", "plan", "status"]);
const MAX_OUTPUT = 512 * 1024;

function execSafe(program, args) {
  try {
    const run = spawnSync(program, args, {
      cwd: ROOT,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 12000,
      maxBuffer: MAX_OUTPUT,
      env: process.env,
    });
    if (run.error || run.status !== 0) return { ok: false, value: "", status: run.status ?? null };
    return { ok: true, value: (run.stdout ?? "").trim(), status: 0 };
  } catch {
    return { ok: false, value: "", status: null };
  }
}
function safeExists(path) {
  try { return existsSync(join(ROOT, path)); } catch { return false; }
}
function fileMeta(path) {
  try {
    const p = join(ROOT, path);
    const info = statSync(p);
    return info.isFile() ? "PRESENT" : "NOT_FILE";
  } catch {
    return "MISSING";
  }
}
function line(k, v) {
  process.stdout.write(String(k) + "=" + String(v) + "\n");
}
function gitState() {
  const head = execSafe("git", ["rev-parse", "--verify", "HEAD"]);
  const branch = execSafe("git", ["branch", "--show-current"]);
  const status = execSafe("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
  const changes = status.ok ? status.value.split(/\r?\n/).filter(Boolean) : [];
  return {
    head: head.ok ? head.value : "UNKNOWN",
    branch: branch.ok && branch.value ? branch.value : "UNKNOWN",
    status: status.ok ? (changes.length === 0 ? "CLEAN" : "MODIFIED") : "UNKNOWN",
    changedCount: status.ok ? changes.length : "UNKNOWN",
  };
}
function preflight() {
  const git = gitState();
  const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
  const npm = execSafe("npm", ["--version"]);
  const mysql = execSafe("mysql", ["--version"]);
  const suspicious = execSafe("git", ["ls-files", "--", "backups/.age-backup-key"]);
  const backedKeyTracked = suspicious.ok && suspicious.value.length > 0;
  const issues = [];
  if (nodeMajor < 22) issues.push("NODE_UNSUPPORTED");
  if (git.head === "UNKNOWN") issues.push("GIT_NOT_AVAILABLE");
  if (git.status !== "CLEAN") issues.push("WORKTREE_NOT_CLEAN_OR_UNKNOWN");
  if (!safeExists("package-lock.json")) issues.push("LOCKFILE_MISSING");
  if (!safeExists("prisma/migrations")) issues.push("PRISMA_HISTORY_MISSING");
  if (backedKeyTracked) issues.push("POSSIBLE_SECRET_TRACKED_IN_GIT");
  if (!mysql.ok) issues.push("MYSQL_CLI_UNAVAILABLE");
  if (!npm.ok) issues.push("NPM_UNAVAILABLE");
  return { git, npm, mysql, issues };
}
function doctor() {
  const x = preflight();
  line("ACTION", "doctor");
  line("STATUS", x.issues.length ? "BLOCKED_FOR_UPGRADE" : "STATIC_CHECKS_ONLY");
  line("VALIDATION", "READ_ONLY_NO_DATABASE_NO_RUNTIME_TEST");
  line("PLATFORM", process.platform);
  line("ARCH", process.arch);
  line("OS_RELEASE", os.release());
  line("NODE_VERSION", process.versions.node);
  line("NPM_VERSION", x.npm.ok ? x.npm.value : "UNAVAILABLE");
  line("MYSQL_CLI", x.mysql.ok ? "PRESENT" : "UNAVAILABLE");
  line("SOURCE_SHA", x.git.head);
  line("BRANCH", x.git.branch);
  line("WORKTREE", x.git.status);
  line("WORKTREE_CHANGES", x.git.changedCount);
  line("LOCKFILE", fileMeta("package-lock.json"));
  line("PRISMA_SCHEMA", fileMeta("prisma/schema.prisma"));
  line("ENV_FILE_PRESENT", safeExists(".env") ? "YES" : "NO");
  line("RISK_FLAGS", x.issues.join(",") || "NONE_STATICALLY_DETECTED");
  line("GATES", "NOT_VERIFIED");
  line("UPGRADE_IMPLEMENTED", "NO");
  return 0;
}
function plan() {
  const x = preflight();
  line("ACTION", "plan");
  line("STATUS", "NO_GO");
  line("SOURCE_SHA", x.git.head);
  line("PRECHECK_ISSUES", x.issues.join(",") || "NONE_STATICALLY_DETECTED");
  const phases = [
    "R00_IDENTIFY_INSTALLED_BASELINE_AND_WORKTREE",
    "R01_PRESERVE_UNCOMMITTED_CHANGES",
    "R02_SECRET_INCIDENT_AND_ARTIFACT_REVIEW",
    "R03_RECONCILE_V1_MAIN_AUTH_SECURITY_TENANT_B2",
    "R04_VERIFY_SIGNED_IMMUTABLE_RELEASE_MANIFEST",
    "R05_CLASSIFY_PRISMA_LINEAGE_AND_P3018",
    "R06_ENCRYPT_BACKUP_AND_VERIFY_RESTORE",
    "R07_SECURITY_AUTH_AND_MFA_TESTS",
    "R08_TWO_TENANT_HTTP_AND_MCP_ISOLATION_TESTS",
    "R09_WHATSAPP_QR_LEASE_AND_PROXY_TESTS",
    "R10_BUILD_LINT_UNIT_INTEGRATION_OPENAPI",
    "R11_STAGING_UPGRADE_RESUME_ROLLBACK_TESTS",
    "R12_RELEASE_AND_DEPLOY_APPROVAL",
  ];
  for (const p of phases) line("REQUIRED_GATE", p);
  line("MUTATING_COMMANDS", "DISABLED_FAIL_CLOSED");
  return 0;
}
function status() {
  const x = gitState();
  line("ACTION", "status");
  line("STATUS", "NO_LOCAL_UPGRADE_EXECUTOR_OR_JOURNAL_IMPLEMENTED");
  line("SOURCE_SHA", x.head);
  line("BRANCH", x.branch);
  line("WORKTREE", x.status);
  line("RUN_ID", "NONE");
  line("GATES", "NOT_VERIFIED");
  return 0;
}
function help() {
  process.stdout.write(
    "ConectaFlow V1 -> V2 preparatory CLI (read-only)\n" +
    "  node scripts/release-v2/upgrade.mjs doctor  # static diagnostics\n" +
    "  node scripts/release-v2/upgrade.mjs plan    # release gates\n" +
    "  node scripts/release-v2/upgrade.mjs status  # no deployed-state inference\n" +
    "  node scripts/release-v2/upgrade.mjs help\n" +
    "Upgrade, resume and rollback are NOT YET IMPLEMENTED; see docs/release-v2.\n"
  );
  return 0;
}
let exitCode;
if (MUTATIONS.has(ACTION)) {
  line("ACTION", ACTION);
  line("STATUS", "BLOCKED_NOT_IMPLEMENTED");
  line("EXIT_CODE", 20);
  line("REASON", "Release manifest, restore proof and executor safety gates not implemented or verified");
  exitCode = 20;
} else if (!READ_ONLY.has(ACTION) || process.argv.length > 3) {
  line("STATUS", "INVALID_ARGUMENTS");
  line("EXIT_CODE", 10);
  exitCode = 10;
} else if (ACTION === "doctor") {
  exitCode = doctor();
} else if (ACTION === "plan") {
  exitCode = plan();
} else if (ACTION === "status") {
  exitCode = status();
} else {
  exitCode = help();
}
process.exitCode = exitCode;
