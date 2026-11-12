import test from "node:test";
import assert from "node:assert/strict";
import { formatWhatsAppPhone, normalizeWhatsAppPhone } from "@/lib/whatsapp-phone";

test("normalizes valid WhatsApp phone numbers and rejects unsafe input", () => {
    assert.equal(normalizeWhatsAppPhone("+55 (11) 99999-9999"), "5511999999999");
    assert.equal(normalizeWhatsAppPhone("5511999999999"), "5511999999999");
    assert.equal(normalizeWhatsAppPhone("1234567"), null);
    assert.equal(normalizeWhatsAppPhone("0005511999999999"), null);
    assert.equal(normalizeWhatsAppPhone("55119999999999999"), null);
    assert.equal(normalizeWhatsAppPhone("not-a-phone"), null);
});

test("formats Brazilian and generic international phone input", () => {
    assert.equal(formatWhatsAppPhone("5511999999999"), "+55 11 99999-9999");
    assert.equal(formatWhatsAppPhone("+1 (202) 555-0100"), "+1 202 555 0100");
});
