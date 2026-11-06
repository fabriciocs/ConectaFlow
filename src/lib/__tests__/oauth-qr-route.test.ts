import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getPairingQr } from "@/app/api/sessions/[sessionId]/qr/route";
import { requiredOAuthScopes } from "../oauth/api-policy";

test("OAuth scopes cannot grant pairing QR capability", () => {
  for (const method of ["GET", "POST", "HEAD"]) {
    assert.equal(requiredOAuthScopes(method, "/api/sessions/synthetic/qr"), null);
  }
});

test("pairing QR rejects OAuth and API-key request headers without accessing session state", async () => {
  const credentialCases: Record<string, string>[] = [
    { authorization: "Bearer synthetic-oauth-token" },
    { "x-api-key": "synthetic-api-key" },
    { authorization: "Bearer synthetic-oauth-token", cookie: "session=synthetic" },
  ];
  for (const headers of credentialCases) {
    const request = new NextRequest("http://127.0.0.1:43000/api/sessions/synthetic/qr", { headers });
    const response = await getPairingQr(request, { params: Promise.resolve({ sessionId: "synthetic" }) });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(Object.hasOwn(body, "qr"), false);
    assert.equal(Object.hasOwn(body, "base64"), false);
  }
});
