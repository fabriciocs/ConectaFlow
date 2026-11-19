import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkTrackedFiles } from "./check-sensitive-tracked-files.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "conectaflow-sec-"));
  const init = spawnSync("git", ["init", "-q", root], { encoding: "utf8", shell: false });
  assert.equal(init.status, 0, "git fixture init");
  function add(path, content) {
    const fsPath = join(root, ...path.split("/"));
    mkdirSync(join(fsPath, ".."), { recursive: true });
    writeFileSync(fsPath, content, { mode: 0o600 });
    const gitAdd = spawnSync("git", ["-C", root, "add", "--", path], { encoding: "utf8", shell: false });
    assert.equal(gitAdd.status, 0, gitAdd.stderr);
  }
  return { root, add, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("accepts clean tracked text without leaking details", () => {
  const f = fixture();
  try {
    f.add("README.md", "Synthetic fixture with no credentials\n");
    const r = checkTrackedFiles(f.root);
    assert.equal(r.status, "PASS");
    assert.equal(r.findings.length, 0);
  } finally { f.cleanup(); }
});
test("blocks historical backup key path even with innocuous content", () => {
  const f = fixture();
  try {
    f.add("backups/.age-backup-key", "synthetic test placeholder\n");
    const r = checkTrackedFiles(f.root);
    assert.equal(r.status, "FAILED");
    assert.ok(r.findings.some((v) => v.reason === "TRACKED_SENSITIVE_PATH"));
  } finally { f.cleanup(); }
});
test("detects plausible age private identity without echoing its value", () => {
  const f = fixture();
  try {
    const marker = ["AGE", "SECRET", "KEY"].join("-") + "-" + "A".repeat(55);
    f.add("config.txt", marker + "\n");
    const r = checkTrackedFiles(f.root);
    assert.equal(r.status, "FAILED");
    assert.equal(r.findings[0].reason, "POSSIBLE_PRIVATE_KEY_CONTENT");
    assert.equal(JSON.stringify(r).includes(marker), false);
  } finally { f.cleanup(); }
});
test("detects PEM private identity without revealing it", () => {
  const f = fixture();
  try {
    const marker = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");
    f.add("notes.md", marker + "\nsynthetic\n");
    const r = checkTrackedFiles(f.root);
    assert.equal(r.status, "FAILED");
    assert.equal(r.findings[0].reason, "POSSIBLE_PRIVATE_KEY_CONTENT");
    assert.equal(JSON.stringify(r).includes(marker), false);
  } finally { f.cleanup(); }
});
test("blocks non-git directories", () => {
  const root = mkdtempSync(join(tmpdir(), "conectaflow-sec-nogit-"));
  try {
    const r = checkTrackedFiles(root);
    assert.equal(r.status, "BLOCKED");
    assert.equal(r.findings[0].reason, "GIT_UNAVAILABLE");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
