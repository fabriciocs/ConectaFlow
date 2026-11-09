import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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
const {
  addNgrokSkipWarningHeader,
  callApi,
  createInputSchema,
  createMultipartFormData,
  isAllowedInvocation,
  isAllowedOperation,
  MAX_MCP_MEDIA_BYTES,
} = await import("../src/server.mjs");

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

test("media MCP schema accepts base64 and describes the multipart adapter", async () => {
  const spec = JSON.parse(await readFile(path.resolve(root, "../../swagger.json"), "utf8"));
  const operation = spec.paths["/messages/{sessionId}/{jid}/media"].post;
  const schema = createInputSchema(operation);
  const input = schema.body.parse({
    fileBase64: Buffer.from("synthetic image bytes").toString("base64"),
    fileName: "sample.png",
    mimeType: "image/png",
    type: "image",
    caption: "synthetic test",
  });

  assert.equal(input.fileName, "sample.png");
  assert.match(schema.body.shape.fileBase64.description, /Base64/);
  assert.equal(MAX_MCP_MEDIA_BYTES, 16 * 1024 * 1024);
});

test("MCP adapter builds multipart file and text fields without contacting WA-AKG", async () => {
  const spec = JSON.parse(await readFile(path.resolve(root, "../../swagger.json"), "utf8"));
  const operation = spec.paths["/messages/{sessionId}/{jid}/media"].post;
  const expectedBytes = Buffer.from("synthetic image bytes");
  const form = createMultipartFormData(operation, {
    fileBase64: expectedBytes.toString("base64"),
    fileName: "sample.png",
    mimeType: "image/png",
    type: "image",
    caption: "synthetic test",
  });
  const file = form.get("file");

  assert.equal(file.name, "sample.png");
  assert.equal(file.type, "image/png");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), expectedBytes);
  assert.equal(form.get("type"), "image");
  assert.equal(form.get("caption"), "synthetic test");
});

test("MCP API call sends multipart with an automatic boundary to a local mock", async () => {
  const spec = JSON.parse(await readFile(path.resolve(root, "../../swagger.json"), "utf8"));
  const operation = spec.paths["/messages/{sessionId}/{jid}/media"].post;
  const expectedBytes = Buffer.from("synthetic integration image");
  let capturedContentType = "";
  let capturedBody = Buffer.alloc(0);
  const mock = createServer(async (request, response) => {
    capturedContentType = request.headers["content-type"] ?? "";
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    capturedBody = Buffer.concat(chunks);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: true }));
  });
  const previousBaseUrl = process.env.WA_AKG_API_BASE_URL;
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const address = mock.address();
  process.env.WA_AKG_API_BASE_URL = `http://127.0.0.1:${address.port}/api`;

  try {
    const result = await callApi("post", "/messages/{sessionId}/{jid}/media", operation, {
      sessionId: "test-session",
      jid: "123@s.whatsapp.net",
      body: {
        fileBase64: expectedBytes.toString("base64"),
        fileName: "sample.png",
        mimeType: "image/png",
        type: "image",
        caption: "synthetic test",
      },
    });
    assert.equal(result.status, 200);
    assert.match(capturedContentType, /^multipart\/form-data; boundary=/);
    assert.match(capturedBody.toString("latin1"), /name="file"; filename="sample\.png"/);
    assert.match(capturedBody.toString("latin1"), /Content-Type: image\/png/);
    assert.ok(capturedBody.includes(expectedBytes));
    assert.match(capturedBody.toString("latin1"), /name="type"\r\n\r\nimage/);
    assert.match(capturedBody.toString("latin1"), /name="caption"\r\n\r\nsynthetic test/);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.WA_AKG_API_BASE_URL;
    else process.env.WA_AKG_API_BASE_URL = previousBaseUrl;
    await new Promise((resolve, reject) => mock.close((error) => error ? reject(error) : resolve()));
  }
});

test("MCP media adapter rejects malformed, oversized, and path-bearing file input", async () => {
  const spec = JSON.parse(await readFile(path.resolve(root, "../../swagger.json"), "utf8"));
  const operation = spec.paths["/messages/{sessionId}/{jid}/media"].post;
  const base = { fileBase64: Buffer.from("image").toString("base64"), fileName: "sample.png", mimeType: "image/png", type: "image" };

  assert.throws(() => createMultipartFormData(operation, { ...base, fileBase64: "not base64!" }), /Base64/);
  assert.throws(() => createMultipartFormData(operation, base, 4), /Decoded media file/);
  assert.throws(() => createMultipartFormData(operation, { ...base, fileName: "../sample.png" }), /plain file name/);
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
