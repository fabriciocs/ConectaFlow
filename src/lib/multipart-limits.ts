export class MultipartLimitError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 413) {
    super(message);
    this.name = "MultipartLimitError";
  }
}

/**
 * Never invoke formData() on an unbounded inbound stream.
 * Limits actual received bytes, not only the untrusted Content-Length header.
 */
export async function readBoundedMultipartForm(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new MultipartLimitError("Expected multipart/form-data", 400);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Invalid upload size limit");
  const advertisedLength = request.headers.get("content-length");
  if (advertisedLength !== null) {
    if (!/^\d{1,20}$/.test(advertisedLength)) throw new MultipartLimitError("Invalid Content-Length", 400);
    if (BigInt(advertisedLength) > BigInt(maxBytes)) throw new MultipartLimitError("Upload too large");
  }
  if (request.signal.aborted) throw new MultipartLimitError("Upload interrupted", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new MultipartLimitError("Missing upload body", 400);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let rejectStopped: ((error: MultipartLimitError) => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  const onAbort = () => rejectStopped?.(new MultipartLimitError("Upload interrupted", 400));
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => rejectStopped?.(new MultipartLimitError("Upload read timeout", 400)), 30_000);
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new MultipartLimitError("Invalid upload body", 400);
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new MultipartLimitError("Upload too large");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* stream aborted */ }
    if (error instanceof MultipartLimitError) throw error;
    throw new MultipartLimitError("Unable to read upload", 400);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* pending read cancelled */ }
  }
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: Buffer.concat(chunks, totalBytes),
  });
  try {
    return await boundedRequest.formData();
  } catch {
    throw new MultipartLimitError("Malformed multipart form", 400);
  }
}
