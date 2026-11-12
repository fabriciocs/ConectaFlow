import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TopLoader } from "@/components/ui/top-loader";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { requestBasePath, requestPublicOrigin, withBasePath } from "@/lib/base-path";
import { resolvePublicAssetUrl } from "@/lib/public-asset-url";
import { getRequestBrandConfig } from "@/lib/branding-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0D3033" },
  ],
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const basePath = requestBasePath(requestHeaders);
  const publicOrigin = requestPublicOrigin(requestHeaders, "http://localhost:43000");
  const socialImage = resolvePublicAssetUrl("/brand/conectaflow-social.png", basePath);
  const brandConfig = await getRequestBrandConfig();
  const appName = brandConfig.name;
  const appDescription = brandConfig.description;

  const appDefaultTitle = `${appName} | Conversas, automações e equipes`;

  return {
    metadataBase: new URL(publicOrigin),
    manifest: withBasePath("/manifest.webmanifest", basePath),
    title: {
      default: appDefaultTitle,
      template: `%s | ${appName}`,
    },
    description: appDescription,
    applicationName: appName,
    icons: { icon: brandConfig.faviconUrl, apple: brandConfig.faviconUrl },
    generator: "Next.js",
    keywords: [
      "whatsapp gateway", "whatsapp api", "whatsapp bot", "whatsapp management",
      "self-hosted", "wa gateway", "whatsapp multi-device", "auto-reply",
      "whatsapp dashboard", "whatsapp web api"
    ],
    referrer: "origin-when-cross-origin",
    authors: [{ name: appName }],
    creator: appName,
    publisher: appName,
    formatDetection: { telephone: false },
    robots: {
      index: process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true",
      follow: process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true",
      googleBot: {
        index: process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true",
        follow: process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true",
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: appName,
      images: [{ url: socialImage, width: 1200, height: 630, alt: `${appName}: conversas e automações` }],
      title: appDefaultTitle,
      description: appDescription,
      url: `${publicOrigin}${withBasePath("/", basePath)}`,
    },
    twitter: {
      card: "summary_large_image",
      images: [socialImage],
      title: appDefaultTitle,
      description: appDescription,
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "default",
      "apple-mobile-web-app-title": appName,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
  const locale = await getLocale();
  const basePath = requestBasePath(await headers());
  const brandConfig = await getRequestBrandConfig();

  return (
    <html lang={locale} data-base-path={basePath} suppressHydrationWarning className="scroll-smooth">
      <head>
        {/* Conditional robots meta (noindex for staging/dev) */}
        {!allowIndexing && <meta name="robots" content="noindex, nofollow" />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased text-foreground bg-background selection:bg-primary/30 selection:text-primary-foreground min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        {/* Global ambient background glow for premium feel */}
        <div className="fixed inset-0 -z-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background dark:from-primary/10 dark:via-background dark:to-background pointer-events-none" suppressHydrationWarning={true} />
        <NextIntlClientProvider>
          <Providers basePath={basePath} brandConfig={brandConfig}>
            <TopLoader />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
