import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
      ],
    }];
  },
  serverExternalPackages: [
    "sharp",
    "systeminformation", // Node runtime uses OS-specific executables; never bundle those binaries.
    "bcryptjs",
    "@whiskeysockets/baileys",
    "whatsapp-rust-bridge",
    "jimp",
    "pino",
    "qrcode-terminal",
  ],
  // Exclude runtime user media from deployment file tracing.
  outputFileTracingExcludes: {
    "/*": ["./data/media/**/*"],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withNextIntl(nextConfig);
