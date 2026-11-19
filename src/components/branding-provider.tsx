"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BrandConfig } from "@/lib/branding";
import { clientBasePath, normalizeBasePath, withoutBasePath } from "@/lib/base-path";
import { resolvePublicAssetUrl } from "@/lib/public-asset-url";

const BrandingContext = createContext<BrandConfig | null>(null);

export function BrandProvider({ brandConfig, children }: { brandConfig: BrandConfig; children: ReactNode }) {
  // Render the request-scoped URL on the server, then reconcile it with the
  // actual browser address (which may differ when a proxy strips its prefix).
  const [browserPrefix, setBrowserPrefix] = useState<string | null>(null);

  useEffect(() => {
    const syncWithPageUrl = () => {
      const prefix = clientBasePath();
      const serverPrefix = normalizeBasePath(document.documentElement.dataset.basePath);
      const favicon = resolvePublicAssetUrl(withoutBasePath(brandConfig.faviconUrl, serverPrefix), prefix);

      setBrowserPrefix(prefix);
      // Metadata is emitted by the server, so repair its local links too when
      // the reverse proxy did not report the public path.
      for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')) {
        if (link.getAttribute("href") === brandConfig.faviconUrl) link.setAttribute("href", favicon);
      }
      const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (manifest) {
        const current = manifest.getAttribute("href");
        if (current?.startsWith("/") && withoutBasePath(current, serverPrefix) === "/manifest.webmanifest") {
          manifest.setAttribute("href", resolvePublicAssetUrl("/manifest.webmanifest", prefix));
        }
      }
    };

    syncWithPageUrl();
    window.addEventListener("popstate", syncWithPageUrl);
    return () => window.removeEventListener("popstate", syncWithPageUrl);
  }, [brandConfig.faviconUrl]);

  const resolvedBrand = useMemo(() => {
    if (browserPrefix === null) return brandConfig;
    const serverPrefix = typeof document === "undefined" ? "" :
      normalizeBasePath(document.documentElement.dataset.basePath);
    return {
      ...brandConfig,
      logoUrl: resolvePublicAssetUrl(withoutBasePath(brandConfig.logoUrl, serverPrefix), browserPrefix),
      faviconUrl: resolvePublicAssetUrl(withoutBasePath(brandConfig.faviconUrl, serverPrefix), browserPrefix),
    };
  }, [brandConfig, browserPrefix]);

  return <BrandingContext.Provider value={resolvedBrand}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandConfig {
  const brandConfig = useContext(BrandingContext);
  if (!brandConfig) throw new Error("useBranding must be used inside BrandProvider");
  return brandConfig;
}
