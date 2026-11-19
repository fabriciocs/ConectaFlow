import assert from "node:assert/strict";
import test from "node:test";
import { MultipartLimitError, readBoundedMultipartForm } from "../multipart-limits";

function multipartRequest(body: BodyInit, extra: HeadersInit = {}) {
  return new Request("http://localhost/api/messages/session/jid/media", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=synthetic-test-boundary", ...extra },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" });
}

test("bounded multipart accepts a small genuine FormData with file", async () => {
  const form = new FormData();
  form.append("type", "image");
  form.append("file", new File(["test-image"], "x.jpg", { type: "image/jpeg" }));
  const request = new Request("http://localhost/test", { method: "PUT", body: form });
  const parsed = await readBoundedMultipartForm(request, 10 * 1024);
  const file = parsed.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.size, 10);
  assert.equal(parsed.get("type"), "image");
});

test("bounded multipart rejects oversized Content-Length before parsing", async () => {
  await assert.rejects(
    readBoundedMultipartForm(multipartRequest("file", { "content-length": "99999999" }), 1024),
    (error) => error instanceof MultipartLimitError && error.status === 413,
  );
});

test("bounded multipart cancels a streaming overflow before EOF", async () => {
  let reads = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      if (reads > 30) throw new Error("unbounded reads");
      controller.enqueue(new Uint8Array(2048));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedMultipartForm(multipartRequest(stream), 4096), { status: 413 });
  assert.ok(cancelled);
  assert.ok(reads < 30);
});

test("bounded multipart rejects wrong Content-Type and aborted requests", async () => {
  const wrong = new Request("http://localhost/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await assert.rejects(readBoundedMultipartForm(wrong, 4096), { status: 400 });
  const controller = new AbortController();
  controller.abort();
  const aborted = new Request("http://localhost/test", {
    method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=test" }, signal: controller.signal,
  });
  await assert.rejects(readBoundedMultipartForm(aborted, 4096), { status: 400 });
});
