import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requestBasePath } from "@/lib/base-path";
import { resolvePublicAssetUrl } from "@/lib/public-asset-url";
import { resolveBrandConfig, type BrandConfig } from "@/lib/branding";

/**
 * Resolves stored branding without changing the persisted URLs. The outgoing
 * image URLs follow the public prefix associated with this request.
 */
export async function getBrandConfig(): Promise<BrandConfig> {
  const environment = {
    APP_TAGLINE: process.env.APP_TAGLINE,
    APP_DESCRIPTION: process.env.APP_DESCRIPTION,
  };
  let brand: BrandConfig;

  try {
    const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
    brand = resolveBrandConfig({ systemConfig, environment });
  } catch (error) {
    console.error("Failed to fetch system config for branding:", error);
    brand = resolveBrandConfig({ environment });
  }

  return brand;
}

/** Resolves public asset URLs only when a Next.js request context exists. */
export async function getRequestBrandConfig(): Promise<BrandConfig> {
  const basePath = requestBasePath(await headers());
  const brand = await getBrandConfig();
  return {
    ...brand,
    logoUrl: brand.logoUrl ? resolvePublicAssetUrl(brand.logoUrl, basePath) : "",
    faviconUrl: resolvePublicAssetUrl(brand.faviconUrl, basePath),
  };
}
