import crypto from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function signWebhookBody(secret: string, body: string): string {
    return `${SIGNATURE_PREFIX}${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyWebhookSignature(
    secret: string,
    body: string,
    signature: string | null | undefined,
): boolean {
    if (!secret || !signature?.startsWith(SIGNATURE_PREFIX)) return false;

    const expected = Buffer.from(signWebhookBody(secret, body), "utf8");
    const received = Buffer.from(signature, "utf8");
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function verifySharedToken(expectedToken: string, suppliedToken: string | null | undefined): boolean {
    if (!expectedToken || !suppliedToken) return false;
    const expected = Buffer.from(expectedToken, "utf8");
    const supplied = Buffer.from(suppliedToken, "utf8");
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}
