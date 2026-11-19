import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSessionUser, unauthorizedResponse } from "@/lib/tenancy/server";
import { ChannelLinkError, channelLinkOriginMatches, completeChannelLink } from "@/lib/channel-identity-linking";

const schema = z.object({ token: z.string().min(43).max(128) }).strict();
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getTenantSessionUser(request);
  if (!user) return unauthorizedResponse();
  try {
    if (!channelLinkOriginMatches(request)) return NextResponse.json({ error: "Request rejected" }, { status: 403, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Linking unavailable" }, { status: 503, headers: noStore });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400, headers: noStore });

  try {
    const result = await completeChannelLink(parsed.data.token, user.id);
    return NextResponse.json({ success: true, alreadyLinked: result.alreadyLinked }, { headers: noStore });
  } catch (error) {
    if (error instanceof ChannelLinkError) {
      if (error.code === "CONFLICT") return NextResponse.json({ error: "Link conflict" }, { status: 409, headers: noStore });
      if (error.code === "INVALID") return NextResponse.json({ error: "Invalid or expired link" }, { status: 400, headers: noStore });
      return NextResponse.json({ error: "Linking unavailable" }, { status: 503, headers: noStore });
    }
    console.error("Channel-link completion unavailable", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Linking unavailable" }, { status: 503, headers: noStore });
  }
}
