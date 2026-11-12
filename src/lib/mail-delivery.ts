import nodemailer from "nodemailer";

type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Resend is preferred when configured; otherwise the existing SMTP transport is used.
 * A failed Resend request is never retried through SMTP, to avoid duplicate deliveries.
 */
export async function sendTransactionalEmail(
  message: TransactionalEmail,
  transportFactory: typeof nodemailer.createTransport = nodemailer.createTransport,
  httpClient: typeof fetch = fetch,
  idempotencyKey?: string,
) {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const from = process.env.MAIL_FROM?.trim();
    if (!from) throw new Error("MAIL_FROM is required when RESEND_API_KEY is set");

    const response = await httpClient("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // Provider responses can include customer data. Do not log or return their bodies.
    if (!response.ok) throw new Error(`Resend delivery failed (HTTP ${response.status})`);
    return;
  }

  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new Error("SMTP is not configured");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP port");
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) throw new Error("SMTP credentials must be configured together");

  const transporter = transportFactory({
    host,
    port,
    secure,
    ...(user && password ? { auth: { user, pass: password } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporter.sendMail({ from, ...message });
}
