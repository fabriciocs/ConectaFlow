import { NextResponse } from "next/server";
import { OAuthError } from "./types";

export const noStoreHeaders = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function oauthJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders });
}

export function errorJson(error: unknown) {
  const oauthError = error instanceof OAuthError ? error : new OAuthError("The OAuth request could not be completed", "server_error", 500);
  return oauthJson({ error: oauthError.code, error_description: oauthError.message }, oauthError.status);
}

export function clientCredentials(request: Request, params: URLSearchParams) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
    if (!match) throw new OAuthError("Client authentication must use HTTP Basic", "invalid_client", 401);
    let decoded: string;
    try { decoded = Buffer.from(match[1], "base64").toString("utf8"); }
    catch { throw new OAuthError("Malformed client authentication", "invalid_client", 401); }
    const separator = decoded.indexOf(":");
    if (separator < 1) throw new OAuthError("Malformed client authentication", "invalid_client", 401);
    return { clientId: decodeURIComponent(decoded.slice(0, separator)), clientSecret: decodeURIComponent(decoded.slice(separator + 1)) };
  }
  return { clientId: params.get("client_id") ?? "", clientSecret: params.get("client_secret") ?? undefined };
}

export const MAX_OAUTH_FORM_BODY_BYTES = 16 * 1024;
export const OAUTH_FORM_READ_TIMEOUT_MS = 15_000;

/**
 * Cap actual bytes before buffering or parsing; Content-Length is advisory only.
 * A single excess chunk terminates the stream immediately, without reading EOF.
 */
export async function formParameters(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") throw new OAuthError("Content-Type must be application/x-www-form-urlencoded", "invalid_request", 400);
  const headerLength = request.headers.get("content-length");
  if (headerLength !== null) {
    if (!/^\d{1,20}$/.test(headerLength)) throw new OAuthError("Invalid Content-Length", "invalid_request", 400);
    if (BigInt(headerLength) > BigInt(MAX_OAUTH_FORM_BODY_BYTES)) throw new OAuthError("OAuth request body is too large", "invalid_request", 413);
  }
  if (request.signal.aborted) throw new OAuthError("OAuth request aborted", "invalid_request", 400);
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();

  let rejectInterrupted: ((reason: OAuthError) => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  const abort = () => rejectInterrupted?.(new OAuthError("OAuth request aborted", "invalid_request", 400));
  request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => rejectInterrupted?.(new OAuthError("OAuth request body timed out", "invalid_request", 408)), OAUTH_FORM_READ_TIMEOUT_MS);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new OAuthError("Invalid OAuth request body chunk", "invalid_request", 400);
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OAUTH_FORM_BODY_BYTES) throw new OAuthError("OAuth request body is too large", "invalid_request", 413);
      chunks.push(Buffer.from(value));
    }
    return new URLSearchParams(Buffer.concat(chunks, totalBytes).toString("utf8"));
  } catch (error) {
    try { await reader.cancel(); } catch { /* aborted stream */ }
    if (error instanceof OAuthError) throw error;
    throw new OAuthError("Unable to read OAuth request body", "invalid_request", 400);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    try { reader.releaseLock(); } catch { /* pending read cancelled */ }
  }
}

export function bearerFrom(request: Request) {
  return /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}
