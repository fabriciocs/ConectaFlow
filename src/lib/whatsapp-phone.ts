const MIN_WHATSAPP_PHONE_DIGITS = 8;
const MAX_WHATSAPP_PHONE_DIGITS = 15;

export function normalizeWhatsAppPhone(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const digits = value.replace(/\D/g, "");
    if (!/^[1-9]\d+$/.test(digits)) return null;
    if (digits.length < MIN_WHATSAPP_PHONE_DIGITS || digits.length > MAX_WHATSAPP_PHONE_DIGITS) return null;
    return digits;
}

export function formatWhatsAppPhone(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, MAX_WHATSAPP_PHONE_DIGITS);
    if (!digits) return "";

    if (digits.startsWith("55")) {
        const area = digits.slice(2, 4);
        const local = digits.slice(4);
        const formattedLocal = local.length > 5
            ? `${local.slice(0, 5)}-${local.slice(5)}`
            : local;
        return `+55${area ? ` ${area}` : ""}${formattedLocal ? ` ${formattedLocal}` : ""}`;
    }

    if (digits.startsWith("1")) {
        const area = digits.slice(1, 4);
        const exchange = digits.slice(4, 7);
        const subscriber = digits.slice(7);
        return `+1${area ? ` ${area}` : ""}${exchange ? ` ${exchange}` : ""}${subscriber ? ` ${subscriber}` : ""}`;
    }

    return `+${digits.match(/.{1,3}/g)?.join(" ") || digits}`;
}
