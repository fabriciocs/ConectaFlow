import { NextRequest } from "next/server";
import { clientCredentials, errorJson, formParameters, oauthJson } from "@/lib/oauth/http";
import { introspectToken } from "@/lib/oauth";
import { checkOAuthRateLimitDistributed, trustedProxyClientIp } from "@/lib/oauth/dcr-rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rate = await checkOAuthRateLimitDistributed("introspect", trustedProxyClientIp(request), { limit: 30, windowMs: 5 * 60 * 1000 });
    if (!rate.allowed) {
      const response = oauthJson({ error: "slow_down", error_description: "Too many introspect requests" }, 429);
      response.headers.set("Retry-After", String(rate.retryAfterSeconds));
      return response;
    }
    const params = await formParameters(request);
    const credentials = clientCredentials(request, params);
    return oauthJson(await introspectToken(params.get("token") ?? "", credentials.clientId, credentials.clientSecret));
  } catch (error) {
    return errorJson(error);
  }
}
