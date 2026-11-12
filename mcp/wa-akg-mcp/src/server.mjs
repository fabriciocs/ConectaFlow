import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultSpecPath = path.resolve(here, "../../../swagger.json");
const specPath = process.env.WA_AKG_OPENAPI_PATH ? path.resolve(process.env.WA_AKG_OPENAPI_PATH) : defaultSpecPath;
const apiKey = process.env.WA_AKG_API_KEY?.trim();
const timeoutMs = boundedInteger(process.env.WA_AKG_TIMEOUT_MS, 15000, 1000, 120000);
const mediaTimeoutMs = boundedInteger(process.env.WA_AKG_MEDIA_TIMEOUT_MS, 120000, 1000, 300000);
const maxResponseBytes = boundedInteger(process.env.WA_AKG_MAX_RESPONSE_BYTES, 1000000, 1024, 10000000);
export const MAX_MCP_MEDIA_BYTES = 16 * 1024 * 1024;
const MAX_MCP_MEDIA_BASE64_LENGTH = Math.ceil(MAX_MCP_MEDIA_BYTES / 3) * 4;
const remoteApiAllowed = process.env.WA_AKG_MCP_ALLOW_REMOTE_API === "true";
const LOCAL_SCOPE_NAMES = new Set(["api:read", "api:write", "mcp:read", "mcp:write", "sessions:read"]);

function localCredentialContext() {
  if (!apiKey) return null;
  const raw = process.env.WA_AKG_MCP_CREDENTIAL_CAPABILITIES?.trim();
  if (!raw) {
    return {
      authMethod: "local-api-key",
      scopes: ["mcp:read", "api:read", "sessions:read"],
      sessionScope: [],
      sessionCapabilities: {},
      operationAllowlist: [],
    };
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const scopes = Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === "string" && LOCAL_SCOPE_NAMES.has(scope))
      ? [...new Set(value.scopes)] : null;
    const rawCapabilities = value.sessionCapabilities;
    if (!scopes || !rawCapabilities || typeof rawCapabilities !== "object" || Array.isArray(rawCapabilities)) return null;
    const sessionCapabilities = {};
    for (const [sessionId, capability] of Object.entries(rawCapabilities)) {
      if (!sessionId || (capability !== "READ" && capability !== "WRITE")) return null;
      sessionCapabilities[sessionId] = capability;
    }
    const operationAllowlist = Array.isArray(value.operationAllowlist) && value.operationAllowlist.every((operation) =>
      typeof operation === "string" && /^[A-Z]+\s+\/[^*\s]+(?:[^*]*)$/.test(operation) && operation !== "*")
      ? [...new Set(value.operationAllowlist)] : null;
    if (!operationAllowlist) return null;
    return {
      authMethod: "local-api-key",
      scopes,
      sessionScope: Object.keys(sessionCapabilities),
      sessionCapabilities,
      operationAllowlist,
    };
  } catch {
    return null;
  }
}
export const server = new McpServer({ name: "wa-akg-mcp", version: "0.1.0" });
const initializedServers = new WeakSet();
const registeredCounts = new WeakMap();
export function createMcpServer() { return new McpServer({ name: "wa-akg-mcp", version: "0.1.0" }); }

function boundedInteger(raw, fallback, min, max) {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Configuration value must be an integer between ${min} and ${max}`);
  return value;
}
function safeBaseUrl() {
  const raw = process.env.WA_AKG_API_BASE_URL ?? "http://127.0.0.1:3030/api";
  let url;
  try { url = new URL(raw); } catch { throw new Error("WA_AKG_API_BASE_URL must be a valid absolute URL"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("WA_AKG_API_BASE_URL must use HTTP or HTTPS");
  if (url.username || url.password) throw new Error("Do not place credentials in WA_AKG_API_BASE_URL; use WA_AKG_API_KEY");
  if (!remoteApiAllowed && !isLoopbackHost(url.hostname)) throw new Error("Remote API targets are disabled. Use loopback or explicitly set WA_AKG_MCP_ALLOW_REMOTE_API=true.");
  if (!isLoopbackHost(url.hostname) && url.protocol !== "https:") throw new Error("Remote WA-AKG API targets must use HTTPS");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}
function isLoopbackHost(host) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
function operationKey(method, route) { return `${method.toUpperCase()} ${route}`; }
export function addNgrokSkipWarningHeader(headers, target) {
  const url = target instanceof URL ? target : new URL(target);
  if (url.hostname.endsWith(".ngrok-free.dev")) headers["ngrok-skip-browser-warning"] = "true";
  return headers;
}
function toolName(method, route) {
  const slug = route.replace(/\{([^}]+)\}/g, "$1").split("/").filter(Boolean).join("_")
    .replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return `wa_akg_${method.toLowerCase()}_${slug || "root"}`;
}
function parameterSchema(parameter) {
  const schema = parameter.schema ?? {};
  let value;
  if (schema.type === "integer") value = z.number().int();
  else if (schema.type === "number") value = z.number();
  else if (schema.type === "boolean") value = z.boolean();
  else if (schema.type === "array") value = z.array(z.unknown());
  else value = z.string();
  if (Array.isArray(schema.enum) && schema.enum.length) value = z.enum(schema.enum.map(String));
  return parameter.required ? value : value.optional();
}

function multipartBinaryProperty(operation) {
  const schema = operation.requestBody?.content?.["multipart/form-data"]?.schema;
  if (!schema || schema.type !== "object") return null;
  const binaryProperties = Object.entries(schema.properties ?? {}).filter(([, value]) => value?.format === "binary");
  if (binaryProperties.length !== 1) return null;
  return { schema, property: binaryProperties[0][0] };
}

export function createInputSchema(operation) {
  const shape = {};
  for (const parameter of operation.parameters ?? []) {
    if (!parameter?.name || !["path", "query", "header"].includes(parameter.in)) continue;
    shape[parameter.name] = parameterSchema(parameter);
  }
  if (operation.requestBody) {
    const multipart = multipartBinaryProperty(operation);
    if (multipart) {
      const required = new Set(multipart.schema.required ?? []);
      const bodyShape = {
        fileBase64: z.string().min(4).max(MAX_MCP_MEDIA_BASE64_LENGTH)
          .describe(`Raw standard Base64 file bytes (maximum ${MAX_MCP_MEDIA_BYTES} decoded bytes; do not include a data URL prefix).`),
        fileName: z.string().min(1).max(255).describe("Original file name, including extension."),
        mimeType: z.string().min(1).max(255).describe("Verified MIME type, such as image/jpeg or image/png."),
      };
      for (const [name, propertySchema] of Object.entries(multipart.schema.properties ?? {})) {
        if (name === multipart.property) continue;
        let value = parameterSchema({ schema: propertySchema, required: required.has(name) });
        if (propertySchema?.description) value = value.describe(propertySchema.description);
        bodyShape[name] = value;
      }
      shape.body = z.object(bodyShape).describe("File data and multipart form fields. The MCP adapter converts the Base64 file to multipart/form-data for WA-AKG.");
    } else {
      shape.body = operation.requestBody.required === true
        ? z.record(z.string(), z.unknown())
        : z.record(z.string(), z.unknown()).optional();
    }
  }
  return shape;
}

export function createMultipartFormData(operation, input, maxFileBytes = MAX_MCP_MEDIA_BYTES) {
  const multipart = multipartBinaryProperty(operation);
  if (!multipart || !input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("This operation does not accept a single-file multipart upload");
  }

  const { fileBase64, fileName, mimeType, ...fields } = input;
  if (typeof fileBase64 !== "string" || fileBase64.length < 4 || fileBase64.length > MAX_MCP_MEDIA_BASE64_LENGTH || fileBase64.length % 4 !== 0) {
    throw new TypeError("fileBase64 must contain a standard Base64 file of at most 16 MiB");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fileBase64)) {
    throw new TypeError("fileBase64 is not valid standard Base64");
  }
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    throw new TypeError("fileName must be a plain file name of at most 255 characters");
  }
  if (typeof mimeType !== "string" || mimeType.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    throw new TypeError("mimeType must be a valid media type");
  }

  const bytes = Buffer.from(fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > maxFileBytes || bytes.toString("base64") !== fileBase64) {
    throw new TypeError(`Decoded media file must be between 1 and ${maxFileBytes} bytes`);
  }

  const properties = multipart.schema.properties ?? {};
  const allowedFields = new Set(Object.keys(properties).filter((name) => name !== multipart.property));
  const unknownFields = Object.keys(fields).filter((name) => !allowedFields.has(name));
  if (unknownFields.length) throw new TypeError(`Unsupported multipart field: ${unknownFields[0]}`);
  for (const name of allowedFields) {
    if ((multipart.schema.required ?? []).includes(name) && fields[name] === undefined) {
      throw new TypeError(`Missing required multipart field: ${name}`);
    }
    const value = fields[name];
    if (value !== undefined && value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new TypeError(`Multipart field ${name} must be a scalar value`);
    }
  }

  const form = new FormData();
  form.append(multipart.property, new Blob([bytes], { type: mimeType }), fileName.trim());
  for (const name of allowedFields) {
    const value = fields[name];
    if (value !== undefined && value !== null) form.append(name, String(value));
  }
  return form;
}
export function isAllowedOperation(method, route, authContext) {
  const effectiveAuthContext = authContext ?? localCredentialContext();
  if (!effectiveAuthContext) return false;
  const verb = method.toLowerCase();
  const scopes = Array.isArray(effectiveAuthContext.scopes) ? effectiveAuthContext.scopes : null;
  if (scopes && !scopes.includes("mcp:read")) return false;
  // Authentication, API credentials, pairing secrets and global administration
  // are not delegated through OAuth. The API rejects these paths independently.
  if (/^\/(?:auth(?:\/|$)|oauth(?:\/|$)|swagger-auth(?:\/|$)|user\/api-key(?:\/|$)|users(?:\/|$)|settings\/system(?:\/|$)|sessions\/[^/]+\/(?:qr|pair)(?:\/|$))/.test(route)) return false;
  // These endpoints are cookie-only or aggregate resources that cannot be
  // restricted to a single OAuth session by the current API contract.
  if (/^\/(?:media(?:\/|$)|notifications(?:\/|$))/.test(route)) return false;
  if (route === "/docs" || route === "/system/monitor" || route === "/system/check-updates") return false;
  if (route === "/scheduler" || /^\/(?:groups\/\{jid\}|webhooks\/\{id\})(?:\/|$)/.test(route)) return false;

  const readRoots = new Set(["sessions", "messages", "contacts", "groups", "webhooks", "autoreplies", "scheduler", "chat", "chats", "profile", "labels", "status", "notifications", "media", "system"]);
  const writeRoots = new Set(["sessions", "messages", "contacts", "groups", "webhooks", "autoreplies", "scheduler", "chat", "chats", "profile", "labels", "notifications"]);
  const root = route.split("/").filter(Boolean)[0];
  if (verb === "get") {
    if (!readRoots.has(root)) return false;
    if (scopes) {
      const sessionRead = /^\/sessions(?:\/[^/]+)?$/.test(route) && scopes.includes("sessions:read");
      if (!sessionRead && !scopes.includes("api:read")) return false;
    }
  } else {
    if (!["post", "put", "patch", "delete"].includes(verb) || !writeRoots.has(root)) return false;
    const configuredWrites = new Set(effectiveAuthContext.operationAllowlist ?? []);
    const grantHasWriteCapability = effectiveAuthContext.authMethod === "oauth-user-delegation" && Object.values(effectiveAuthContext.sessionCapabilities ?? {}).includes("WRITE");
    const operationAllowed = configuredWrites.has(operationKey(verb, route)) || (grantHasWriteCapability && configuredWrites.size === 0);
    if (!operationAllowed) return false;
    // HTTP API writes also require api:write. mcp:write alone is not a bearer
    // permission for direct API writes, and the MCP server must not bypass that.
    if (scopes && (!scopes.includes("mcp:write") || !scopes.includes("api:write"))) return false;
  }

  // A session-limited grant can only see operations whose first resource
  // parameter identifies that session. The API repeats this check per call.
  if (Array.isArray(effectiveAuthContext.sessionScope)) {
    if (verb === "get" && route === "/sessions") return scopes?.includes("sessions:read") || scopes?.includes("api:read") || !scopes;
    const sessionRoute = /^\/(?:sessions\/\{(?:id|sessionId)\}|messages\/\{sessionId\}|contacts\/\{sessionId\}|groups\/\{sessionId\}|webhooks\/\{sessionId\}|autoreplies\/\{sessionId\}|scheduler\/\{sessionId\}|chat\/\{sessionId\}|chats\/\{sessionId\}|profile\/\{sessionId\}|labels\/\{sessionId\}|status\/\{sessionId\}|system\/monitor\/\{sessionId\})(?:\/|$)/;
    if (!sessionRoute.test(route)) return false;
  }
  return true;
}

export function isAllowedInvocation(method, route, args, authContext) {
  if (!isAllowedOperation(method, route, authContext)) return false;
  const verb = method.toLowerCase();
  const sessionId = args?.sessionId ?? args?.id;
  const effectiveAuthContext = authContext ?? localCredentialContext();
  if (effectiveAuthContext?.authMethod === "local-api-key" && verb === "get" && effectiveAuthContext.scopes?.includes("api:read")) return true;
  if (!effectiveAuthContext?.sessionCapabilities) return false;
  if (!sessionId) return verb === "get" && route === "/sessions";
  const capability = effectiveAuthContext.sessionCapabilities[String(sessionId)];
  if (verb === "get") return capability === "READ" || capability === "WRITE";
  return capability === "WRITE";
}
function pathForRoute(route, args) {
  return route.replace(/\{([^}]+)\}/g, (_match, name) => {
    const value = args[name];
    if (value === undefined || value === null || value === "") throw new Error(`Missing required path parameter: ${name}`);
    return encodeURIComponent(String(value));
  });
}
function buildUrl(baseUrl, route, operation, args) {
  const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}${pathForRoute(route, args)}`);
  for (const parameter of operation.parameters ?? []) {
    if (parameter.in !== "query") continue;
    const value = args[parameter.name];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(parameter.name, String(item));
    else url.searchParams.set(parameter.name, String(value));
  }
  return url;
}
export async function callApi(method, route, operation, args, authContext) {
  const baseUrl = safeBaseUrl();
  const url = buildUrl(baseUrl, route, operation, args);
  const headers = addNgrokSkipWarningHeader({ Accept: "application/json" }, url);
  if (authContext?.authMethod === "oauth-user-delegation") {
    const accessToken = authContext.accessToken;
    if (!accessToken) throw new Error("OAuth request credential is unavailable");
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (apiKey) headers["X-API-Key"] = apiKey;
  let body;
  let requestTimeoutMs = timeoutMs;
  if (operation.requestBody && args.body !== undefined) {
    if (multipartBinaryProperty(operation)) {
      body = createMultipartFormData(operation, args.body);
      requestTimeoutMs = mediaTimeoutMs;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args.body);
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { method: method.toUpperCase(), headers, body, signal: controller.signal, redirect: "error" });
    const contentType = response.headers.get("content-type") ?? "";
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > maxResponseBytes) {
      await response.body?.cancel();
      throw new Error("API response exceeded WA_AKG_MCP_MAX_RESPONSE_BYTES");
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maxResponseBytes) throw new Error("API response exceeded WA_AKG_MCP_MAX_RESPONSE_BYTES");
    let data = raw;
    if (contentType.includes("json") && raw) { try { data = JSON.parse(raw); } catch { /* keep invalid JSON as text */ } }
    if (!response.ok) {
      const detail = typeof data === "string" ? data.slice(0, 1000) : JSON.stringify(data).slice(0, 1000);
      throw new Error(`WA-AKG API returned HTTP ${response.status}: ${detail}`);
    }
    return { status: response.status, data };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`WA-AKG API request timed out after ${requestTimeoutMs} ms`);
    if (error instanceof TypeError) throw new Error("Could not connect to WA-AKG API; check WA_AKG_API_BASE_URL and whether the API is running");
    throw error;
  } finally { clearTimeout(timeout); }
}
function registerApiTools(spec, targetServer = server, authContext) {
  let registered = 0;
  const usedNames = new Set();
  for (const [route, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!["get", "post", "put", "patch", "delete"].includes(method) || !isAllowedOperation(method, route, authContext)) continue;
      let name = toolName(method, route);
      if (usedNames.has(name)) name = `${name}_${Buffer.from(route).toString("hex").slice(0, 8)}`;
      usedNames.add(name);
      const methodLabel = method.toUpperCase();
      const description = [
        operation.summary ?? `${methodLabel} ${route}`,
        `WA-AKG API operation: ${methodLabel} ${route}.`,
        multipartBinaryProperty(operation) ? `For the file, provide body.fileBase64 as raw standard Base64 plus body.fileName and body.mimeType. The MCP adapter converts it to multipart/form-data (maximum ${MAX_MCP_MEDIA_BYTES} decoded bytes).` : "",
        method === "get" ? "Read operation. Session ownership and OAuth scopes are enforced by WA-AKG." : "Write operation. This changes WA-AKG data or may trigger external WhatsApp/webhook effects; OAuth write scopes, session ownership and WA-AKG role checks are enforced by the API."
      ].filter(Boolean).join(" ");
      targetServer.registerTool(name, {
        title: operation.summary ?? name,
        description,
        inputSchema: createInputSchema(operation),
        annotations: { readOnlyHint: method === "get", destructiveHint: method === "delete", idempotentHint: ["get", "put", "delete"].includes(method), openWorldHint: false }
      }, async (args) => {
        try {
          if (!isAllowedInvocation(method, route, args, authContext)) throw new Error("The current OAuth grant does not permit this MCP operation for the selected session");
          const result = await callApi(method, route, operation, args, authContext);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2).slice(0, maxResponseBytes) }] };
        } catch (error) {
          return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Unknown WA-AKG API error" }] };
        }
      });
      registered += 1;
    }
  }
  return registered;
}
export async function initializeMcpServer(targetServer = server, authContext) {
  if (initializedServers.has(targetServer)) return registeredCounts.get(targetServer) ?? 0;
  const raw = await readFile(specPath, "utf8");
  const spec = JSON.parse(raw);
  if (!spec.openapi || !spec.paths) throw new Error(`Invalid OpenAPI document: ${specPath}`);
  const effectiveAuthContext = authContext ?? localCredentialContext();
  const count = registerApiTools(spec, targetServer, effectiveAuthContext);
  targetServer.registerTool("wa_akg_server_info", {
    title: "WA-AKG MCP server information",
    description: "Returns safe runtime metadata and the configured API target without revealing credentials.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => {
    const baseUrl = safeBaseUrl();
    const availableWriteTools = Object.entries(spec.paths ?? {}).reduce((count, [route, item]) => count + Object.keys(item ?? {}).filter((method) => ["post", "put", "patch", "delete"].includes(method) && isAllowedOperation(method, route, effectiveAuthContext)).length, 0);
    return { content: [{ type: "text", text: JSON.stringify({
      server: "wa-akg-mcp", version: "0.1.0", openapiVersion: spec.openapi,
      apiTitle: spec.info?.title ?? "WA-AKG API", apiVersion: spec.info?.version ?? "unknown",
      apiBaseUrl: baseUrl.origin + baseUrl.pathname, apiKeyConfigured: Boolean(apiKey),
      authentication: effectiveAuthContext?.authMethod ?? "none",
      writeToolsEnabled: availableWriteTools > 0, writePolicy: authContext ? "grant-operation-capabilities" : "credential-explicit-capabilities", writeCapabilityCount: availableWriteTools, registeredApiTools: count
    }, null, 2) }] };
  });
  initializedServers.add(targetServer);
  registeredCounts.set(targetServer, count);
  return count;
}

async function main() {
  await initializeMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // stdout is reserved for MCP protocol messages; diagnostics go to stderr.
    console.error(`wa-akg-mcp startup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
