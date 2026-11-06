// Read-only loopback HTTP contract. Never calls actions with side effects.
import assert from "node:assert/strict";
const port = Number(process.argv[2] || "43000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_LOCAL_PORT");
const base = "http://127.0.0.1:" + port;
const checked = [];
async function get(pathname, init = {}) {
  const response = await fetch(base + pathname, { redirect: "manual", signal: AbortSignal.timeout(8000), ...init });
  return response;
}
function pass(name) { checked.push(name); }
const home = await get("/");
assert.equal(home.status, 200, "Homepage must render");
pass("homepage");
const sessions = await get("/api/sessions");
assert.equal(sessions.status, 401, "Anonymous session list denied");
pass("anonymous sessions denied");
const qr = await get("/api/sessions/synthetic-not-present/qr");
assert.equal(qr.status, 401);
assert.match(qr.headers.get("cache-control") ?? "", /no-store/);
pass("anonymous QR denied and uncacheable");
const media = await get("/api/media/synthetic-not-present.jpg");
assert.equal(media.status, 401);
pass("anonymous private media denied");
const metadata = await get("/.well-known/oauth-authorization-server");
assert.equal(metadata.status, 200);
const oauth = await metadata.json();
assert.equal(oauth.authorization_endpoint, base + "/api/oauth/authorize");
assert.equal(oauth.token_endpoint, base + "/api/oauth/token");
assert.ok(oauth.code_challenge_methods_supported?.includes("S256"));
pass("OAuth discovery points to local PKCE S256 endpoints");
const legacy = await get("/authorize?response_type=code&client_id=synthetic-client&state=synthetic-state");
assert.equal(legacy.status, 307);
assert.equal(legacy.headers.get("location"), base + "/api/oauth/authorize?response_type=code&client_id=synthetic-client&state=synthetic-state");
pass("legacy authorize redirect preserves parameters");
const mcp = await get("/mcp");
assert.equal(mcp.status, 401, "Unauthenticated MCP is forbidden");
assert.match(mcp.headers.get("www-authenticate") ?? "", /Bearer/);
pass("MCP bearer authentication enforced");
const swagger = await get("/swagger");
assert.ok(swagger.status >= 200 && swagger.status < 400, "Swagger route available");
pass("Swagger route available");
console.log("STATUS=VERIFIED;HTTP_CONTRACTS=" + checked.length + ";PORT=" + port + ";SCOPE=localhost-only");
