#!/usr/bin/env node
/**
 * Safe, read-only Git tracked-file check. Never prints file contents or secret values.
 * This is a preventive guard, not a substitute for key rotation or history remediation.
 * Supports Node >=22 on Windows, macOS and Linux; no third-party packages.
 */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const OWN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const AGE_MARKER = ["AGE", "SECRET", "KEY"].join("-") + "-";
const AGE_SECRET_REGEX = new RegExp(AGE_MARKER + "[0-9A-Z]{30,}", "g");
const PEM_HEADER = ["-----BEGIN", "(?:[A-Z0-9]+ )?PRIVATE", "KEY-----"].join(" ");
const PEM_PRIVATE_REGEX = new RegExp(PEM_HEADER);
const RISKY_PATHS = [
  /(^|\/)backups\//i,
  /(^|\/)\.age-backup-key$/i,
  /(^|\/)[^/]*\.agekey$/i,
  /(^|\/)[^/]*\.age-identity$/i,
  /(^|\/)[^/]*\.age-private-key$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)backup-audit\.log$/i,
];

function gitTrackedPaths(root) {
  const child = spawnSync("git", ["ls-files", "--cached", "--full-name", "-z"], {
    cwd: root,
    shell: false,
    windowsHide: true,
    encoding: "buffer",
    timeout: 30000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error || child.status !== 0 || !child.stdout) {
    return { ok: false, paths: [] };
  }
  return {
    ok: true,
    paths: child.stdout.toString("utf8").split("\0").filter(Boolean),
  };
}

export function checkTrackedFiles(root = OWN_ROOT) {
  const directory = resolve(root);
  const entries = gitTrackedPaths(directory);
  if (!entries.ok) return { status: "BLOCKED", checked: 0, findings: [{ path: "(git)", reason: "GIT_UNAVAILABLE" }] };

  const findings = [];
  let checked = 0;
  let omitted = 0;
  let unavailable = 0;
  for (const name of entries.paths) {
    const normalized = name.replaceAll("\\", "/");
    const absolute = resolve(directory, name);
    const rel = relative(directory, absolute);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep)) {
      findings.push({ path: "(invalid tracked path)", reason: "PATH_OUTSIDE_REPO" });
      continue;
    }
    if (RISKY_PATHS.some((pattern) => pattern.test(normalized))) {
      findings.push({ path: normalized, reason: "TRACKED_SENSITIVE_PATH" });
    }
    let meta;
    try {
      meta = lstatSync(absolute);
    } catch {
      unavailable += 1;
      continue;
    }
    if (!meta.isFile()) {
      omitted += 1;
      continue;
    }
    if (meta.size > MAX_TEXT_BYTES) {
      omitted += 1;
      continue;
    }
    let data;
    try {
      data = readFileSync(absolute);
    } catch {
      unavailable += 1;
      continue;
    }
    if (data.includes(0)) {
      omitted += 1;
      continue;
    }
    checked += 1;
    const str = data.toString("utf8");
    AGE_SECRET_REGEX.lastIndex = 0;
    if (AGE_SECRET_REGEX.test(str) || PEM_PRIVATE_REGEX.test(str)) {
      findings.push({ path: normalized, reason: "POSSIBLE_PRIVATE_KEY_CONTENT" });
    }
  }
  return { status: findings.length > 0 ? "FAILED" : unavailable > 0 ? "BLOCKED" : "PASS", checked, omitted, unavailable, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write("STATUS=INVALID_ARGUMENTS\n");
    process.exitCode = 10;
  } else {
    const result = checkTrackedFiles();
    process.stdout.write("STATUS=" + result.status + "\n");
    process.stdout.write("TRACKED_TEXT_CHECKED=" + result.checked + "\n");
    process.stdout.write("NON_TEXT_OR_UNSUPPORTED_FILES=" + result.omitted + "\n");
    process.stdout.write("UNAVAILABLE_TRACKED_FILES=" + (result.unavailable ?? 0) + "\n");
    process.stdout.write("FINDING_COUNT=" + result.findings.length + "\n");
    for (const item of result.findings) {
      process.stdout.write("FINDING=" + item.reason + ":" + item.path + "\n");
    }
    process.exitCode = result.status === "PASS" ? 0 : result.status === "BLOCKED" ? 2 : 3;
  }
}
