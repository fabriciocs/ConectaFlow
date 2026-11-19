import test from "node:test";
import assert from "node:assert/strict";
import { forbiddenPath, textFindings } from "./check-tracked-secrets.mjs";

test("rejects tracked private age identities, backup runtime state and credential files", () => {
  for (const path of [
    "backups/.age-backup-key",
    "backups/backup-audit.log",
    "backups/.backup.lock",
    "backups/new-snapshot.tar.gz.age",
    "exports/encrypted.age",
    "backups/.backup-control/state",
    ".env",
    "mcp/.env.production",
    "user/.ssh/id_ed25519",
    "certs/identity.p12",
  ]) {
    assert.equal(forbiddenPath(path), true, path);
  }
});
test("allows documentation templates and normal source code", () => {
  assert.equal(forbiddenPath(".env.example"), false);
  assert.equal(forbiddenPath("mcp/.env.example"), false);
  assert.equal(forbiddenPath("src/app/page.tsx"), false);
});
test("detects age identity-like text without recording matched values", () => {
  const fabricated = ["AGE", "SECRET", "KEY"].join("-") + "-" + "A".repeat(60);
  assert.deepEqual(textFindings(fabricated), ["AGE_IDENTITY"]);
  assert.deepEqual(textFindings("public age recipient: age1abc"), []);
});
test("detects token-like content in examples", () => {
  const fabricated = "github_pat_" + "x".repeat(35);
  assert.deepEqual(textFindings("GITHUB_TOKEN=" + fabricated), ["GITHUB_TOKEN"]);
});
test("does not flag ordinary authentication prose", () => {
  assert.deepEqual(textFindings("Token handling must be encrypted."), []);
});
