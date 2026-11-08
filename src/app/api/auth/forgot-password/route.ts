import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";

const schema = z.object({ email: z.string().trim().email().max(254) });
const responseBody = { message: "If this email has an account, a recovery link will be sent." };

export async function POST(request: Request) {
  const data = schema.safeParse(await request.json().catch(() => null));
  if (data.success) await requestPasswordReset(data.data.email, request);
  return NextResponse.json(responseBody, { status: 200, headers: { "Cache-Control": "no-store" } });
}
