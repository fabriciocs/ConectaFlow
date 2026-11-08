import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendTransactionalEmail } from "../mail-delivery";

const message = {
  to: "recipient@example.test",
  subject: "Account confirmation",
  text: "Confirm your account.",
  html: "<p>Confirm your account.</p>",
};

async function withMailEnvironment(values: Record<string, string>, run: () => Promise<void>) {
  const names = ["RESEND_API_KEY", "MAIL_FROM", "SMTP_HOST", "SMTP_FROM", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD"];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);
    await run();
  } finally {
    for (const name of names) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else Object.assign(process.env, { [name]: value });
    }
  }
}

test("Resend uses the server-only key, configured sender and stable idempotency key", async () => {
  await withMailEnvironment({ RESEND_API_KEY: "re_test_only", MAIL_FROM: "App <mail@example.test>", SMTP_HOST: "smtp.example.test" }, async () => {
    let called = 0;
    const smtp = (() => { throw new Error("SMTP must not be used"); }) as typeof nodemailer.createTransport;
    const http = (async (input: string, init: RequestInit) => {
      called++;
      assert.equal(input, "https://api.resend.com/emails");
      assert.equal(init.method, "POST");
      const headers = init.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer re_test_only");
      assert.equal(headers["Idempotency-Key"], "verification-record-1");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal);
      assert.deepEqual(JSON.parse(init.body as string), {
        from: "App <mail@example.test>",
        to: ["recipient@example.test"],
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return new Response(JSON.stringify({ id: "provider-message-id" }), { status: 200 });
    }) as unknown as typeof fetch;
    await sendTransactionalEmail(message, smtp, http, "verification-record-1");
    assert.equal(called, 1);
  });
});

test("Resend failure is reported without switching to SMTP or leaking provider body", async () => {
  await withMailEnvironment({ RESEND_API_KEY: "re_test_only", MAIL_FROM: "mail@example.test", SMTP_HOST: "smtp.example.test" }, async () => {
    const smtp = (() => { throw new Error("SMTP must not be used"); }) as typeof nodemailer.createTransport;
    const http = (async () => new Response("sensitive provider details", { status: 422 })) as typeof fetch;
    await assert.rejects(sendTransactionalEmail(message, smtp, http), /^Error: Resend delivery failed \(HTTP 422\)$/);
  });
});

test("Invalid Resend configuration fails closed, without SMTP fallback", async () => {
  await withMailEnvironment({ RESEND_API_KEY: "re_test_only", SMTP_HOST: "smtp.example.test", SMTP_FROM: "mail@example.test" }, async () => {
    const smtp = (() => { throw new Error("SMTP must not be used"); }) as typeof nodemailer.createTransport;
    const http = (async () => { throw new Error("HTTP must not be used"); }) as typeof fetch;
    await assert.rejects(sendTransactionalEmail(message, smtp, http), /MAIL_FROM is required/);
  });
});

test("Existing SMTP remains available without a Resend key", async () => {
  await withMailEnvironment({ SMTP_HOST: "smtp.example.test", SMTP_FROM: "mail@example.test", SMTP_PORT: "587" }, async () => {
    let sent: unknown;
    const smtp = (() => ({ sendMail: async (value: unknown) => { sent = value; } })) as unknown as typeof nodemailer.createTransport;
    const http = (async () => { throw new Error("Resend must not be used"); }) as typeof fetch;
    await sendTransactionalEmail(message, smtp, http);
    assert.deepEqual(sent, { from: "mail@example.test", ...message });
  });
});
