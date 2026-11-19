"use client";

import { useBranding } from "@/components/branding-provider";
import Link from "@/components/app-link";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  homeLink?: boolean;
};

export function BrandMark({ className, imageClassName, fallbackClassName, homeLink = false }: BrandMarkProps) {
  const brand = useBranding();

  const mark = brand.logoUrl ? (
      <img
        src={brand.logoUrl}
        alt={`${brand.name} logo`}
        className={cn("h-16 w-16 rounded-2xl object-cover", className, imageClassName)}
      />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-primary text-xl font-bold text-white shadow-lg shadow-primary/30",
        className,
        fallbackClassName,
      )}
    >
      {brand.logoFallback}
    </span>
  );

  if (!homeLink) return mark;

  return (
    <Link
      href="/"
      aria-label={`Ir para a página inicial de ${brand.name}`}
      className="inline-flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {mark}
    </Link>
  );
}
