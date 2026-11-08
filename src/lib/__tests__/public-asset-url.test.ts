import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicAssetUrl, resolvePublicAssetUrlFromPage } from "../public-asset-url";

test("assets use the same origin and base path as the loaded page", () => {
  const asset = "/brand/conectaflow-mark.svg";
  const cases = [
    ["http://localhost:43000/auth/login", asset],
    ["http://127.0.0.1:43000/dashboard", asset],
    ["http://localhost:8080/wa-akg/auth/login", "/wa-akg" + asset],
    ["https://example.ngrok-free.dev/wa-akg/auth/forgot-password", "/wa-akg" + asset],
    ["https://cdn.example.test/customer/portal/dashboard", "/customer/portal" + asset],
    ["https://example.ngrok-free.dev/wa-akg", "/wa-akg" + asset],
  ];
  for (const [pageUrl, expected] of cases) {
    const actual = resolvePublicAssetUrlFromPage(asset, pageUrl);
    assert.equal(actual, expected);
    assert.equal(new URL(actual, pageUrl).origin, new URL(pageUrl).origin);
  }
});

test("applies the public prefix once, including query strings", () => {
  assert.equal(resolvePublicAssetUrl("/brand/icon.svg?v=1#mark", "/wa-akg"), "/wa-akg/brand/icon.svg?v=1#mark");
  assert.equal(resolvePublicAssetUrl("/wa-akg/brand/icon.svg", "/wa-akg"), "/wa-akg/brand/icon.svg");
  assert.equal(resolvePublicAssetUrl("/api/media/abc.jpg", "/wa-akg"), "/wa-akg/api/media/abc.jpg");
});

test("external images, data URLs and other non-root addresses are unchanged", () => {
  for (const asset of [
    "https://images.example.test/logo.svg", "blob:local-id",
    "data:image/png;base64,AAAA", "brand/logo.svg", "//example.test/logo.svg",
  ]) {
    assert.equal(resolvePublicAssetUrlFromPage(asset, "https://example.ngrok-free.dev/wa-akg/dashboard"), asset);
  }
});

test("does not derive asset URLs from invalid page URLs", () => {
  assert.equal(resolvePublicAssetUrlFromPage("/brand/logo.svg", "not-a-url"), "/brand/logo.svg");
  assert.equal(resolvePublicAssetUrlFromPage("/brand/logo.svg", "file:///tmp/example.html"), "/brand/logo.svg");
});
