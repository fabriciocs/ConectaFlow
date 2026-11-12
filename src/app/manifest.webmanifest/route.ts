import { NextResponse } from "next/server";
import buildManifest from "@/lib/webmanifest";

/**
 * Explicit route avoids Next.js auto-inserting a root-only PWA manifest link.
 * The root layout renders the per-request public URL instead.
 */
export async function GET() {
  return NextResponse.json(await buildManifest(), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
