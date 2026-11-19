import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRecordedHashes, lineageFor, parseDatabaseName, sha256 } from "../prisma-bootstrap-v2.mjs";

const v2 = "20261104000000_v2_initial_schema";
const row = (migration_name) => ({ migration_name });

test("extracts explicit MySQL database name without exposing credentials", () => {
  assert.equal(parseDatabaseName("mysql://user:secret@127.0.0.1:3306/wa_akg_test"), "wa_akg_test");
  assert.throws(() => parseDatabaseName("postgres://a:b@localhost/wa_akg"), /MySQL/);
  assert.throws(() => parseDatabaseName("mysql://a:b@localhost/wa-akg"), /suportado/);
  assert.throws(() => parseDatabaseName(""), /ausente/);
});

test("classifies only genuinely empty databases as new", () => {
  assert.equal(lineageFor([], [], v2), "empty");
  assert.equal(lineageFor(["User"], [], v2), "unmanaged");
  assert.equal(lineageFor(["_prisma_migrations"], [], v2), "unknown");
});

test("distinguishes V1 and V2 histories and refuses mixed versions", () => {
  assert.equal(lineageFor(["_prisma_migrations", "User"], [row("20261024000000_baseline")], v2), "v1");
  assert.equal(lineageFor(["_prisma_migrations", "User"], [row(v2)], v2), "v2");
  assert.equal(lineageFor(["_prisma_migrations", "User"], [row(v2), row("20261024000000_baseline")], v2), "mixed");
});

test("SHA-256 calculation is stable", () => {
  assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("checks the applied retry and blocks unresolved or inconsistent migration rows", () => {
  const migration = "20261031100000_add_inbound_event_message_id";
  const directory = new URL("../../prisma/migrations/", import.meta.url);
  const checksum = sha256(readFileSync(new URL(`${migration}/migration.sql`, directory)));
  const paths = fileURLToPath(directory);
  const applied = { migration_name: migration, checksum, finished_at: new Date(), rolled_back_at: null };
  const rolledBack = { ...applied, checksum: "old attempt", finished_at: null, rolled_back_at: new Date() };

  assert.deepEqual(checkRecordedHashes([rolledBack, applied], paths), []);
  assert.equal(checkRecordedHashes([rolledBack], paths)[0]?.reason, "not_finished");
  assert.equal(checkRecordedHashes([rolledBack, { ...applied, checksum: "wrong" }], paths)[0]?.reason, "checksum_or_file");
  assert.equal(checkRecordedHashes([{ ...rolledBack, rolled_back_at: null }, applied], paths)[0]?.reason, "not_finished");
});
