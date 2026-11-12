import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.WA_AKG_API_KEY = "test-api-key";
process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES = JSON.stringify({
  scopes: ["mcp:read", "api:read", "sessions:read"],
  sessionCapabilities: { "test-session": "READ" },
  operationAllowlist: [],
});
const { addNgrokSkipWarningHeader, isAllowedInvocation, isAllowedOperation } = await import("../src/server.mjs");

test("server contains protocol, allowlist and network safeguards", async () => {
  const source = await readFile(path.join(root, "src", "server.mjs"), "utf8");
  assert.match(source, /StdioServerTransport/);
  assert.doesNotMatch(source, /WA_AKG_MCP_WRITE_ALLOWLIST/);
  assert.match(source, /WA_AKG_MCP_CREDENTIAL_CAPABILITIES/);
  assert.match(source, /redirect: "error"/);
  assert.match(source, /isLoopbackHost/);
});

test("write operations require grant operation capabilities", async () => {
  const source = await readFile(path.join(root, "src", "server.mjs"), "utf8");
  assert.match(source, /operationAllowlist/);
  assert.match(source, /scopes\.includes\("mcp:write"\) \|\| !scopes\.includes\("api:write"\)/);
  const previous = process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES;
  try {
    process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES = JSON.stringify({
      scopes: ["mcp:read", "api:read", "mcp:write", "api:write"],
      sessionCapabilities: { "test-session": "WRITE" },
      operationAllowlist: ["POST /messages/{sessionId}/{jid}/send"],
    });
    assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", undefined), true);
    assert.equal(isAllowedOperation("post", "/groups/{sessionId}/create", undefined), false);
    process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES = JSON.stringify({
      scopes: ["mcp:read", "api:read", "mcp:write", "api:write"],
      sessionCapabilities: { "test-session": "WRITE" },
      operationAllowlist: ["*"],
    });
    assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", undefined), false);
    assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { scopes: ["mcp:read", "mcp:write", "api:write"], operationAllowlist: ["POST /messages/{sessionId}/{jid}/send"] }), true);
    assert.equal(isAllowedOperation("post", "/groups/{sessionId}/create", { scopes: ["mcp:read", "mcp:write", "api:write"], operationAllowlist: ["POST /messages/{sessionId}/{jid}/send"] }), false);
    assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { authMethod: "oauth-user-delegation", scopes: ["mcp:read", "mcp:write", "api:write"], sessionCapabilities: { "test-session": "WRITE" }, operationAllowlist: [] }), true);
    assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { authMethod: "oauth-user-delegation", scopes: ["mcp:read", "mcp:write", "api:write"], sessionCapabilities: { "test-session": "WRITE" }, operationAllowlist: ["*"] }), false);
    assert.equal(isAllowedOperation("post", "/auth/register", { scopes: ["mcp:read", "mcp:write", "api:write"], operationAllowlist: ["*"] }), false);
  } finally {
    process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES = previous;
  }
});

test("default OpenAPI path points to the repository swagger file", async () => {
  const source = await readFile(path.join(root, "src", "server.mjs"), "utf8");
  assert.match(source, /\.\.\/\.\.\/\.\.\/swagger\.json/);
});

test("ngrok warning bypass header is scoped to ngrok-free.dev upstream hosts", () => {
  const ngrokHeaders = addNgrokSkipWarningHeader({ Accept: "application/json" }, new URL("https://wa-akg.example.ngrok-free.dev/api"));
  const normalHeaders = addNgrokSkipWarningHeader({ Accept: "application/json" }, new URL("https://api.example.test/api"));
  assert.equal(ngrokHeaders["ngrok-skip-browser-warning"], "true");
  assert.equal(normalHeaders["ngrok-skip-browser-warning"], undefined);
});

test("OAuth MCP tools require read scope and writes require both MCP and API write scopes", () => {
  assert.equal(isAllowedOperation("get", "/sessions", { scopes: ["mcp:read"] }), false);
  assert.equal(isAllowedOperation("get", "/sessions", { scopes: ["mcp:read", "sessions:read"] }), true);
  assert.equal(isAllowedOperation("get", "/messages/{sessionId}/search", { scopes: ["mcp:read", "api:read"] }), true);
  assert.equal(isAllowedOperation("get", "/sessions", { scopes: ["sessions:read"] }), false);
  assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { scopes: ["mcp:read"] }), false);
  assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { scopes: ["mcp:read", "mcp:write"] }), false);
  assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", { scopes: ["mcp:read", "mcp:write", "api:write"], operationAllowlist: ["POST /messages/{sessionId}/{jid}/send"] }), true);
  const scopedWrite = { scopes: ["mcp:read", "api:read", "mcp:write", "api:write"], sessionScope: ["session-db-id"] };
  const scopedWriteWithCapability = { ...scopedWrite, sessionCapabilities: { "session-db-id": "WRITE" }, operationAllowlist: ["POST /messages/{sessionId}/{jid}/spam", "DELETE /sessions/{id}/settings"] };
  assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/spam", scopedWriteWithCapability), true);
  assert.equal(isAllowedOperation("delete", "/sessions/{id}/settings", scopedWriteWithCapability), true);
  assert.equal(isAllowedOperation("get", "/messages/{sessionId}/download/{messageId}/media", scopedWrite), true);
  assert.equal(isAllowedOperation("get", "/sessions/{id}/qr", scopedWrite), false);
  assert.equal(isAllowedOperation("post", "/sessions/{sessionId}/pair", { ...scopedWriteWithCapability, authMethod: "oauth-user-delegation" }), false);
  assert.equal(isAllowedOperation("post", "/auth/register", scopedWrite), false);
  assert.equal(isAllowedOperation("post", "/users", scopedWrite), false);
  assert.equal(isAllowedOperation("post", "/groups/{jid}/leave", scopedWrite), false);
  assert.equal(isAllowedOperation("post", "/messages/{sessionId}/{jid}/send", undefined), false);
});

test("a local API key has read access by default while writes stay disabled", () => {
  const previous = process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES;
  try {
    delete process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES;
    assert.equal(isAllowedInvocation("get", "/sessions", {}, undefined), true);
    assert.equal(isAllowedInvocation("get", "/messages/{sessionId}/search", { sessionId: "any-session" }, undefined), true);
    assert.equal(isAllowedInvocation("post", "/messages/{sessionId}/{jid}/send", { sessionId: "any-session" }, undefined), false);
  } finally {
    process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES = previous;
  }
});
