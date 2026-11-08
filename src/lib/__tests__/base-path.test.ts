import test from "node:test";
import assert from "node:assert/strict";
import { clientBasePath, normalizeBasePath, requestBasePath, requestPublicOrigin, safeCallbackPath, withBasePath, withoutBasePath } from "../base-path";

test("normalizes the reverse-proxy prefix and applies it exactly once", () => {
  assert.equal(normalizeBasePath("/wa-akg/"), "/wa-akg");
  assert.equal(requestBasePath(new Headers({ "x-forwarded-prefix": "/wa-akg/" })), "/wa-akg");
  assert.equal(withBasePath("/dashboard/sessions?tab=all", "/wa-akg"), "/wa-akg/dashboard/sessions?tab=all");
  assert.equal(withBasePath("/wa-akg/dashboard", "/wa-akg"), "/wa-akg/dashboard");
  assert.equal(withBasePath("/dashboard", ""), "/dashboard");
  assert.equal(normalizeBasePath("/../outside"), "");
});

test("uses forwarded public scheme and host for redirects behind the proxy", () => {
  const headers = new Headers({
    "x-forwarded-host": "gauntlet-fruit-discount.ngrok-free.dev",
    "x-forwarded-proto": "https",
  });
  assert.equal(requestPublicOrigin(headers, "http://127.0.0.1:43000"), "https://gauntlet-fruit-discount.ngrok-free.dev");
  assert.equal(requestPublicOrigin(new Headers(), "http://localhost:43000"), "http://localhost:43000");
  assert.equal(requestPublicOrigin(new Headers({ host: "localhost:43000" }), "http://fallback.invalid"), "http://localhost:43000");
  assert.equal(requestPublicOrigin(new Headers({ host: "localhost:8080", "x-forwarded-proto": "https" }), "http://fallback.invalid"), "https://localhost:8080");
});

test("strips only the configured prefix while preserving the route", () => {
  assert.equal(withoutBasePath("/wa-akg/dashboard/chat/123", "/wa-akg"), "/dashboard/chat/123");
  assert.equal(withoutBasePath("/wa-akg", "/wa-akg"), "/");
  assert.equal(withoutBasePath("/dashboard", "/wa-akg"), "/dashboard");
});

test("keeps login callback URLs same-origin and prefix-safe", () => {
  assert.equal(safeCallbackPath("/auth/oauth/consent?requestId=abc", "/wa-akg"), "/wa-akg/auth/oauth/consent?requestId=abc");
  assert.equal(safeCallbackPath("https://attacker.example.test/steal", "/wa-akg"), "/wa-akg/dashboard");
  assert.equal(safeCallbackPath("//attacker.example.test/steal", "/wa-akg"), "/wa-akg/dashboard");
  assert.equal(safeCallbackPath("/\\\\attacker.example.test", "/wa-akg"), "/wa-akg/dashboard");
});

test("uses the real loaded browser path instead of a server-side path hint", async () => {
  const { basePathFromPathname } = await import("../base-path");
  assert.equal(basePathFromPathname("/auth/login"), "");
  assert.equal(basePathFromPathname("/dashboard"), "");
  assert.equal(basePathFromPathname("/wa-akg"), "/wa-akg");
  assert.equal(basePathFromPathname("/wa-akg/auth/forgot-password"), "/wa-akg");
  assert.equal(basePathFromPathname("/customer/portal/dashboard/sessions/123"), "/customer/portal");

  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      location: { pathname: "/wa-akg/auth/login" },
      documentElement: { dataset: { basePath: "" } },
    },
  });
  try {
    assert.equal(clientBasePath(), "/wa-akg");
    (globalThis.document as { location: { pathname: string } }).location.pathname = "/auth/login";
    assert.equal(clientBasePath(), "");
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("reads the runtime prefix rendered on the document", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: { basePath: "/wa-akg/" } } },
  });
  try {
    assert.equal(clientBasePath(), "/wa-akg");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
