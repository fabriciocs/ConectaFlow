import type { SessionCapability } from "./types";

export type SessionCapabilityMap = Record<string, SessionCapability>;

export class InvalidSessionCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSessionCapabilityError";
  }
}

const CAPABILITIES = new Set<SessionCapability>(["READ", "WRITE"]);

export function parseSessionCapabilities(value: unknown): SessionCapabilityMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([sessionId, capability]) => Boolean(sessionId) && typeof capability === "string" && CAPABILITIES.has(capability as SessionCapability)),
    ) as SessionCapabilityMap;
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.filter((sessionId): sessionId is string => typeof sessionId === "string" && sessionId.length > 0).map((sessionId) => [sessionId, "READ"]),
    );
  }

  return {};
}

export function normalizeSessionCapabilities(sessionIds: string[], requested?: SessionCapabilityMap): SessionCapabilityMap {
  const selected = [...new Set(sessionIds.filter(Boolean))];
  const requestedMap = requested ?? {};
  const unknown = Object.keys(requestedMap).filter((sessionId) => !selected.includes(sessionId));
  if (unknown.length) throw new InvalidSessionCapabilityError("Session capabilities must target selected sessions");

  return Object.fromEntries(selected.map((sessionId) => {
    const capability = requestedMap[sessionId] ?? "READ";
    if (!CAPABILITIES.has(capability)) throw new InvalidSessionCapabilityError("Unsupported session capability");
    return [sessionId, capability];
  }));
}

export function parseSubmittedSessionCapabilities(rawJson: string | null, entries: string[] = []): SessionCapabilityMap | undefined {
  if (rawJson !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new InvalidSessionCapabilityError("sessionCapabilities must be valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidSessionCapabilityError("sessionCapabilities must be an object");
    }
    return parsed as SessionCapabilityMap;
  }
  if (!entries.length) return undefined;
  const result: SessionCapabilityMap = {};
  for (const entry of entries) {
    const separator = entry.lastIndexOf(":");
    const sessionId = separator > 0 ? entry.slice(0, separator) : "";
    const capability = separator > 0 ? entry.slice(separator + 1) : "";
    if (!sessionId || (capability !== "READ" && capability !== "WRITE")) {
      throw new InvalidSessionCapabilityError("sessionCapability contains an invalid value");
    }
    result[sessionId] = capability;
  }
  return result;
}

export function sessionIdsFromCapabilities(value: unknown): string[] {
  return Object.keys(parseSessionCapabilities(value));
}

export function projectSessionCapabilitiesToPublic(
  value: unknown,
  sessions: Array<{ id: string; sessionId: string }>,
): SessionCapabilityMap {
  const raw = parseSessionCapabilities(value);
  return Object.fromEntries(
    sessions.flatMap((session) => {
      const capability = raw[session.id] ?? raw[session.sessionId];
      return capability ? [[session.sessionId, capability]] : [];
    }),
  );
}

export function hasWriteCapability(value: unknown): boolean {
  return Object.values(parseSessionCapabilities(value)).some((capability) => capability === "WRITE");
}
