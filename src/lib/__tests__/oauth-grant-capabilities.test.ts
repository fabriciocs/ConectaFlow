import test from "node:test";
import assert from "node:assert/strict";
import {
  hasWriteCapability,
  normalizeSessionCapabilities,
  parseSubmittedSessionCapabilities,
  parseSessionCapabilities,
  projectSessionCapabilitiesToPublic,
  sessionIdsFromCapabilities,
} from "../oauth/grant-capabilities";

test("OAuth grants default every selected session to READ", () => {
  assert.deepEqual(normalizeSessionCapabilities(["session-a", "session-b"]), {
    "session-a": "READ",
    "session-b": "READ",
  });
});

test("OAuth grants preserve independent READ and WRITE capabilities per session", () => {
  const capabilities = normalizeSessionCapabilities(["session-a", "session-b"], { "session-b": "WRITE" });
  assert.deepEqual(capabilities, { "session-a": "READ", "session-b": "WRITE" });
  assert.equal(hasWriteCapability(capabilities), true);
  assert.deepEqual(sessionIdsFromCapabilities(capabilities), ["session-a", "session-b"]);
});

test("OAuth grants reject capabilities for sessions not selected by the user", () => {
  assert.throws(
    () => normalizeSessionCapabilities(["session-a"], { "session-b": "WRITE" }),
    /must target selected sessions/,
  );
});

test("legacy session arrays remain read-only during the incremental migration", () => {
  assert.deepEqual(parseSessionCapabilities(["session-a"]), { "session-a": "READ" });
  assert.deepEqual(parseSessionCapabilities({ "session-a": "WRITE", "session-b": "invalid" }), { "session-a": "WRITE" });
  assert.equal(hasWriteCapability(["session-a"]), false);
});

test("consent form accepts JSON or repeated session capability entries", () => {
  assert.deepEqual(parseSubmittedSessionCapabilities('{"session-a":"READ","session-b":"WRITE"}'), {
    "session-a": "READ",
    "session-b": "WRITE",
  });
  assert.deepEqual(parseSubmittedSessionCapabilities(null, ["session-a:READ", "session-b:WRITE"]), {
    "session-a": "READ",
    "session-b": "WRITE",
  });
  assert.throws(() => parseSubmittedSessionCapabilities(null, ["session-a:ADMIN"]), /invalid value/);
});

test("userinfo projects internal grant ids to public session ids for MCP", () => {
  assert.deepEqual(projectSessionCapabilitiesToPublic({ "db-session-a": "WRITE", "wa-session-b": "READ" }, [
    { id: "db-session-a", sessionId: "wa-session-a" },
    { id: "db-session-b", sessionId: "wa-session-b" },
  ]), {
    "wa-session-a": "WRITE",
    "wa-session-b": "READ",
  });
});
