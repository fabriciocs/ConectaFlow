import assert from "node:assert/strict";
import test from "node:test";
import { formParameters, MAX_OAUTH_FORM_BODY_BYTES } from "../oauth/http";

function encodedRequest(body: BodyInit | null, extra: HeadersInit = {}, signal?: AbortSignal) {
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...extra },
    body,
    signal,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" });
}

test("OAuth accepts form at exact byte boundary and preserves parameter decoding", async () => {
  const suffix = "a".repeat(MAX_OAUTH_FORM_BODY_BYTES - "client_id=".length);
  const params = await formParameters(encodedRequest("client_id=" + suffix));
  assert.equal(params.get("client_id"), suffix);
});

test("OAuth rejects advertised length above cap before body parsing", async () => {
  const request = encodedRequest("client_id=x", { "content-length": String(MAX_OAUTH_FORM_BODY_BYTES + 1) });
  await assert.rejects(formParameters(request), { status: 413 });
});

test("OAuth stream cancels on cap+1, without reading the full payload", async () => {
  let delivered = 0;
  let cancelled = false;
  const data = new Uint8Array(4096);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      delivered += data.byteLength;
      if (delivered > 128 * 1024) throw new Error("stream was not bounded");
      controller.enqueue(data);
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(formParameters(encodedRequest(stream)), { status: 413 });
  assert.ok(cancelled);
  assert.ok(delivered < 128 * 1024);
});

test("OAuth caps actual UTF-8 bytes, not Unicode code point length", async () => {
  const body = "client_id=" + "\u20AC".repeat(6000);
  assert.ok(body.length < MAX_OAUTH_FORM_BODY_BYTES);
  await assert.rejects(formParameters(encodedRequest(body)), { status: 413 });
});

test("OAuth rejects aborted body and invalid content types", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(formParameters(encodedRequest("client_id=x", {}, controller.signal)), { status: 400 });
  const wrong = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await assert.rejects(formParameters(wrong), { status: 400 });
});
