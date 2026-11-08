import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySharedToken } from "@/lib/webhook-signature";
import { ChannelLinkError, issueChannelLinkChallenge } from "@/lib/channel-identity-linking";

const schema = z.object({
  sessionId: z.string().min(1).max(191),
  jid: z.string().min(1).max(255),
  requestId: z.string().max(191).optional(),
}).strict();

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const configuredToken = process.env.WA_AKG_CHANNEL_LINK_TOKEN?.trim();
  if (!configuredToken || !verifySharedToken(configuredToken, request.headers.get("x-wa-akg-channel-link-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });

  try {
    const challenge = await issueChannelLinkChallenge({ ...parsed.data, request });
    return NextResponse.json(challenge, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ChannelLinkError) {
      const status = error.code === "DISABLED" ? 404
        : error.code === "RATE_LIMITED" ? 429
          : error.code === "UNAVAILABLE" ? 503 : 400;
      return NextResponse.json({ error: "Unable to create link challenge" }, { status, headers: noStore });
    }
    console.error("Channel-link challenge unavailable", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to create link challenge" }, { status: 503, headers: noStore });
  }
}
