// Exercises public-client authorization only. No consent, token exchange or
// WhatsApp action. Successful probes create short-lived local auth requests.
import assert from "node:assert/strict";

const port = Number(process.argv[2] || "43000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_LOCAL_PORT");
const origin = `http://127.0.0.1:${port}`;
const base = new URL(`${origin}/api/oauth/authorize`);
base.search = new URLSearchParams({
  response_type: "code",
  client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: "A".repeat(43),
  code_challenge_method: "S256",
  state: "synthetic-cimd-http-regression",
  scope: "api:read mcp:read sessions:read",
}).toString();

async function probe(resource) {
  const url = new URL(base);
  if (resource !== undefined) url.searchParams.set("resource", resource);
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
}

for (const resource of [undefined, `${origin}/mcp`]) {
  const response = await probe(resource);
  assert.equal(response.status, 307, "CIMD authorization must reach login");
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, "/auth/login");
}

for (const resource of ["https://other.example.test/mcp", `${origin}/other`]) {
  const response = await probe(resource);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_target");
}
console.log("STATUS=VERIFIED;OAUTH_CIMD_CONTRACTS=4;CONSENT=NOT_PERFORMED;TOKENS=NOT_ISSUED");
