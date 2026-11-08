import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type VerificationLogEvent = {
  email: string;
  userId: string;
  verificationId?: string;
  status: "rate_limited" | "created" | "sent" | "delivery_failed" | "verified" | "already_verified";
  expiresAt?: string;
  recoveryUrl?: string;
  errorCode?: string;
};

export async function writeEmailVerificationLog(event: VerificationLogEvent) {
  const directory = join(process.cwd(), "logs");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await appendFile(join(directory, "email-verification.jsonl"),
    JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n",
    { encoding: "utf8", mode: 0o600 });
}
