import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { commandFor } = require("../container-start.js");

const sampleEnv = {
  MYSQL_HOST: "db",
  MYSQL_PORT: "3306",
  MYSQL_DATABASE: "wa_akg_test",
  MYSQL_APP_USER: "test",
  MYSQL_APP_PASSWORD: "synthetic-test-value",
};

test("Docker migration defaults to guarded V2 router without empty-DB permission", () => {
  const [entry, args] = commandFor("migrate", sampleEnv);
  assert.match(entry, /prisma-bootstrap-v2\.mjs$/);
  assert.ok(args.includes("--allow-legacy-deploy"));
  assert.ok(args.includes("--expect-db"));
  assert.ok(args.includes("wa_akg_test"));
  assert.equal(args.includes("--confirm-empty-v2"), false);
  assert.equal(JSON.stringify(args).includes(sampleEnv.MYSQL_APP_PASSWORD), false);
});

test("Docker migration requires exact explicit opt-in for empty V2", () => {
  const [, enabled] = commandFor("migrate", { ...sampleEnv, WA_AKG_ALLOW_EMPTY_V2_BOOTSTRAP: "true" });
  const [, disabled] = commandFor("migrate", { ...sampleEnv, WA_AKG_ALLOW_EMPTY_V2_BOOTSTRAP: "TRUE" });
  assert.ok(enabled.includes("--confirm-empty-v2"));
  assert.equal(disabled.includes("--confirm-empty-v2"), false);
});
