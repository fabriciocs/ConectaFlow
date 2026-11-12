import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const entrypoint = join(dirname(fileURLToPath(import.meta.url)), "upgrade.mjs");

function call(action, extra = [], env = process.env) {
  return spawnSync(process.execPath, [entrypoint, action, ...extra], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    env,
  });
}
test("all mutating operations fail closed before manifest and safety gates", () => {
  for (const action of ["upgrade", "resume", "rollback", "prepare", "migrate", "activate"]) {
    const r = call(action);
    assert.equal(r.status, 20, action + " must fail closed");
    assert.match(r.stdout, /STATUS=BLOCKED_NOT_IMPLEMENTED/);
    assert.match(r.stdout, /EXIT_CODE=20/);
  }
});
test("read-only plan never claims release readiness", () => {
  const r = call("plan");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /STATUS=NO_GO/);
  assert.match(r.stdout, /R06_ENCRYPT_BACKUP_AND_VERIFY_RESTORE/);
  assert.match(r.stdout, /MUTATING_COMMANDS=DISABLED_FAIL_CLOSED/);
});
test("doctor does not echo credential values supplied in environment", () => {
  const sentinel = "SENTINEL_CONFIDENTIAL_VALUE_NEVER_ECHO";
  const r = call("doctor", [], { ...process.env, DATABASE_URL: sentinel, RESEND_API_KEY: sentinel });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VALIDATION=READ_ONLY_NO_DATABASE_NO_RUNTIME_TEST/);
  assert.match(r.stdout, /UPGRADE_IMPLEMENTED=NO/);
  assert.doesNotMatch(r.stdout, /SENTINEL_CONFIDENTIAL_VALUE_NEVER_ECHO/);
  assert.doesNotMatch(r.stderr ?? "", /SENTINEL_CONFIDENTIAL_VALUE_NEVER_ECHO/);
});
test("status reports missing runtime journal rather than an invented deployment", () => {
  const r = call("status");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /STATUS=NO_LOCAL_UPGRADE_EXECUTOR_OR_JOURNAL_IMPLEMENTED/);
  assert.match(r.stdout, /GATES=NOT_VERIFIED/);
});
test("unknown command and unexpected arguments are rejected", () => {
  for (const [action, extra] of [["unrecognized", []], ["doctor", ["--unsafe"]]]) {
    const r = call(action, extra);
    assert.equal(r.status, 10);
    assert.match(r.stdout, /INVALID_ARGUMENTS/);
  }
});
