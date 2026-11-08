import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordWithToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(80).max(1024),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(
    { code: "INVALID_RESET_REQUEST" }, { status: 400, headers: { "Cache-Control": "no-store" } },
  );
  try {
    if (!(await resetPasswordWithToken(parsed.data.token, parsed.data.password))) {
      return NextResponse.json(
        { code: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Password reset failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { code: "RESET_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
