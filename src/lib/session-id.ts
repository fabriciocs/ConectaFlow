import { randomBytes } from "node:crypto";

/** Prisma's default String identifiers are limited to 191 characters in MySQL. */
export const SESSION_ID_MAX_LENGTH = 191;

/**
 * Session IDs cross HTTP, Socket.IO and persistence boundaries. Keep them
 * opaque and delimiter-free so they cannot become room namespaces or paths.
 */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/;

export function isValidSessionId(value: unknown): value is string {
    return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function generateSessionId(): string {
    return randomBytes(16).toString("hex");
}
