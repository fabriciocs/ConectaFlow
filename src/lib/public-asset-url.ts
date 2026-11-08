import { basePathFromPathname, normalizeBasePath, withBasePath } from "./base-path";

/** Assets follow the actual public route, never a separately configured CDN. */
export function resolvePublicAssetUrl(assetUrl: string, basePath = ""): string {
  if (!assetUrl.startsWith("/") || assetUrl.startsWith("//")) return assetUrl;
  return withBasePath(assetUrl, normalizeBasePath(basePath));
}

/** Browser-visible page URL is the source of truth for assets. */
export function resolvePublicAssetUrlFromPage(assetUrl: string, pageUrl: string | URL): string {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return assetUrl;
    return resolvePublicAssetUrl(assetUrl, basePathFromPathname(url.pathname));
  } catch {
    return assetUrl;
  }
}
