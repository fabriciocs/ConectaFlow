#!/usr/bin/env node
/**
 * Guardrail against accidentally committing credential material.
 * Reads only tracked files in the checkout. Prints rule IDs and paths,
 * never matching source text or credential values.
 * Heuristic: PASS does not establish that the Git history is clean.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_BYTES = 4 * 1024 * 1024;

export function forbiddenPath(name) {
  const p = name.replaceAll("\\", "/");
  return /(^|\/)\.age-backup-key$/i.test(p)
    || /(^|\/)(?:id_rsa|id_ed25519|id_ecdsa)$/i.test(p)
    || /(^|\/)\.env(?:\.[^/]*)?$/i.test(p) && !/\.env\.example$/i.test(p)
    || /(^|\/)\.ssh\//i.test(p)
    || /^backups\/(?:backup-audit\.log|\.backup\.lock|\.backup-control\/)/i.test(p)
    || /\.(?:p12|pfx|agekey|age-identity|age-private-key)$/i.test(p);
}

const RULES = [
  ["AGE_IDENTITY", /AGE-SECRET-KEY-[A-Z0-9]{32,}/],
  ["PRIVATE_KEY_PEM", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["GITHUB_TOKEN", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS_ACCESS_KEY", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["RESEND_API_KEY", /\bRESEND_API_KEY\s*[:=]\s*["']?re_[A-Za-z0-9_-]{16,}/],
];

export function textFindings(content) {
  return RULES.filter(([, re]) => re.test(content)).map(([id]) => id);
}

export function auditTracked() {
  const listed = spawnSync("git", ["ls-files", "-z", "--cached"], {
    cwd: ROOT,
    shell: false,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20000,
    windowsHide: true,
  });
  if (listed.error || listed.status !== 0 || !listed.stdout) {
    return { error: "CANNOT_ENUMERATE_TRACKED_FILES", findings: [], scanned: 0, skippedBinary: 0 };
  }
  const names = listed.stdout.toString("utf8").split("\0").filter(Boolean);
  const findings = [];
  let scanned = 0;
  let skippedBinary = 0;
  let incomplete = 0;
  for (const name of names) {
    if (forbiddenPath(name)) findings.push({ name, rule: "FORBIDDEN_TRACKED_PATH" });
    try {
      const target = join(ROOT, name);
      const st = lstatSync(target);
      if (st.isSymbolicLink()) {
        ++incomplete;
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) {
        ++incomplete;
        continue;
      }
      const bytes = readFileSync(target);
      if (bytes.includes(0)) {
        ++skippedBinary;
        continue;
      }
      ++scanned;
      const rules = textFindings(bytes.toString("utf8"));
      for (const rule of rules) findings.push({ name, rule });
    } catch {
      ++incomplete;
    }
  }
  return { findings, scanned, skippedBinary, incomplete };
}

function main() {
  const result = auditTracked();
  if (result.error) {
    console.error("STATUS=BLOCKED");
    console.error("REASON=" + result.error);
    process.exitCode = 2;
    return;
  }
  for (const finding of result.findings) {
    // No secret values or source lines in output.
    console.error("FINDING=" + finding.rule + " FILE=" + JSON.stringify(finding.name));
  }
  console.log("TRACKED_TEXT_FILES_SCANNED=" + result.scanned);
  console.log("BINARY_FILES_SKIPPED=" + result.skippedBinary);
  console.log("FILES_UNEXAMINED=" + result.incomplete);
  console.log("FINDINGS=" + result.findings.length);
  console.log("HISTORY_SCAN=NOT_PERFORMED");
  if (result.findings.length) {
    console.log("STATUS=FAILED");
    process.exitCode = 30;
  } else if (result.incomplete) {
    console.log("STATUS=BLOCKED_INCOMPLETE");
    process.exitCode = 20;
  } else {
    console.log("STATUS=PASS_HEURISTIC_HEAD_ONLY");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
