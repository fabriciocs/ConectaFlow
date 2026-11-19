import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const shellScript = readFileSync(join(root, "start.sh"), "utf8").replace(/\r\n/g, "\n");

test("legacy V1 start script must fail closed in a V2 checkout", () => {
  assert.ok(shellScript.startsWith("#!/bin/bash"));
  assert.ok(shellScript.includes("BLOCKED_LEGACY_UPGRADE_SCRIPT"));
  assert.match(shellScript, /V2_START_ROOT=.*dirname --/);
  assert.match(shellScript, /exit 20/);
  const guard = shellScript.indexOf("BLOCKED_LEGACY_UPGRADE_SCRIPT");
  assert.ok(guard >= 0);
  for (const operation of [
    "\nnpm install\n",
    "\nnpx prisma db push\n",
    "\nnpm run build\n",
    "\n    pm2 reload ",
    "\n    pm2 start ",
  ]) {
    const pos = shellScript.indexOf(operation);
    assert.ok(pos > guard, "Legacy mutating command must remain guarded");
  }
});

test("read-only V2 doctor is documented as the safe alternative", () => {
  assert.ok(shellScript.includes("node scripts/release-v2/upgrade.mjs doctor"));
});
