const apiBaseUrl = process.env.WA_AKG_PROD_API_BASE_URL;
const replicaBaseUrls = (process.env.WA_AKG_PROD_REPLICA_API_BASE_URLS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const accessToken = process.env.WA_AKG_PROD_OAUTH_ACCESS_TOKEN;

function fail(message, exitCode = 1) {
  console.error(`Production sessions check failed: ${message}`);
  process.exitCode = exitCode;
}

function parsePublicApiBase(raw, label) {
  let base;
  try {
    base = new URL(raw);
  } catch {
    fail(`${label} must be an absolute HTTPS URL`);
    return null;
  }

  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(base.hostname.toLowerCase());
  if (base.protocol !== "https:" || loopback || base.username || base.password || base.search || base.hash) {
    fail(`${label} must be a public HTTPS URL without credentials, query, or fragment`);
    return null;
  }
  if (!base.pathname.replace(/\/+$/, "").endsWith("/api")) {
    fail(`${label} must end in /api, including any deployment base path`);
    return null;
  }
  base.pathname = base.pathname.replace(/\/+$/, "");
  return base;
}

async function checkSessions(base, targetIndex) {
  const sessionsUrl = new URL(`${base.toString()}/sessions`);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Cache-Control": "no-store",
  };
  if (sessionsUrl.hostname.endsWith(".ngrok-free.dev")) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(sessionsUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      fail(`target #${targetIndex} returned HTTP ${response.status} with a non-JSON response`);
      return false;
    }
    if (!response.ok) {
      fail(`target #${targetIndex} returned HTTP ${response.status}; response body omitted`);
      return false;
    }
    if (payload?.status !== true || !Array.isArray(payload?.data)) {
      fail(`target #${targetIndex} returned an unexpected response shape; session data omitted`);
      return false;
    }
    console.log(`Target #${targetIndex} passed: GET /sessions returned HTTP ${response.status}; ${payload.data.length} session(s).`);
    return true;
  } catch (error) {
    fail(error?.name === "AbortError"
      ? `target #${targetIndex} timed out after 15 seconds`
      : `target #${targetIndex} could not be completed; URL, TLS, or network error`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

if (!apiBaseUrl || !accessToken) {
  fail("set WA_AKG_PROD_API_BASE_URL and WA_AKG_PROD_OAUTH_ACCESS_TOKEN in the process environment", 2);
} else if (/\s/.test(accessToken)) {
  fail("WA_AKG_PROD_OAUTH_ACCESS_TOKEN must contain only the token value");
} else {
  const rawTargets = [apiBaseUrl, ...replicaBaseUrls];
  const uniqueTargets = [...new Set(rawTargets)];
  const targets = uniqueTargets
    .map((raw, index) => parsePublicApiBase(raw, index === 0 ? "WA_AKG_PROD_API_BASE_URL" : `replica target #${index}`))
    .filter((base) => base !== null);

  if (targets.length === uniqueTargets.length) {
    let passed = 0;
    for (let index = 0; index < targets.length; index += 1) {
      if (await checkSessions(targets[index], index + 1)) passed += 1;
    }
    if (passed === targets.length) {
      console.log(`Production sessions check passed for ${targets.length} target(s).`);
    } else {
      process.exitCode = 1;
    }
  }
}
