import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { DEFAULT_BRAND_DESCRIPTION, DEFAULT_BRAND_NAME } from "@/lib/branding";
import { requestBasePath } from "@/lib/base-path";
import { resolvePublicAssetUrl } from "@/lib/public-asset-url";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const basePath = requestBasePath(await headers());
  const assetUrl = (path: string) => resolvePublicAssetUrl(path, basePath);
  return {
    name: DEFAULT_BRAND_NAME,
    short_name: DEFAULT_BRAND_NAME,
    description: DEFAULT_BRAND_DESCRIPTION,
    display: "standalone",
    background_color: "#F6F7EF",
    theme_color: "#0D3033",
    icons: [
      { src: assetUrl("/brand/conectaflow-icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: assetUrl("/brand/conectaflow-icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
