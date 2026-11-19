import assert from "node:assert/strict";
import test from "node:test";
import { createPinnedDnsLookup } from "../security";
import { isPrivateWebhookDestinationAllowed } from "../webhook-egress-policy";

const localUrl = "http://127.0.0.1:5678/webhook/approved";
const tenant = "tenant-A";
const policy = JSON.stringify([{ tenantId: tenant, url: localUrl }]);

test("operator egress grant is exact by tenant, path and port", () => {
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, tenant, policy), true);
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, "tenant-B", policy), false);
  assert.equal(isPrivateWebhookDestinationAllowed("http://127.0.0.1:5678/webhook/unapproved", tenant, policy), false);
  assert.equal(isPrivateWebhookDestinationAllowed("http://127.0.0.1:5679/webhook/approved", tenant, policy), false);
  assert.equal(isPrivateWebhookDestinationAllowed("http://10.0.0.1:5678/webhook/approved", tenant, policy), false);
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, tenant, ""), false);
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, tenant, "not-json"), false);
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, tenant, "[]"), false);
  assert.equal(isPrivateWebhookDestinationAllowed(localUrl, tenant, JSON.stringify([{ tenantId: tenant, url: "http://localhost:5678/webhook/approved" }])), false);
});

test("operator egress grant cannot permit metadata, link-local or public hosts", () => {
  for (const url of [
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1.evil.invalid:5678/webhook/approved",
    "http://example.com/webhook/approved",
    "http://[fe80::1]:5678/webhook/approved",
    "http://127.0.0.1:5678/webhook/approved#fragment",
  ]) {
    assert.equal(isPrivateWebhookDestinationAllowed(url, tenant, JSON.stringify([{ tenantId: tenant, url }])), false, url);
  }
});

test("pinned lookup selects native callback shape for all:true", async () => {
  const lookup = createPinnedDnsLookup("127.0.0.1") as unknown as (
    hostname: string,
    options: { all: boolean },
    callback: (error: Error | null, addresses: unknown, family?: number) => void
  ) => void;
  const all = await new Promise<unknown>((resolve, reject) =>
    lookup("example.invalid", { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses))
  );
  assert.deepEqual(all, [{ address: "127.0.0.1", family: 4 }]);
  const single = await new Promise<{ address: unknown; family: number | undefined }>((resolve, reject) =>
    lookup("example.invalid", { all: false }, (error, address, family) =>
      error ? reject(error) : resolve({ address, family }))
  );
  assert.deepEqual(single, { address: "127.0.0.1", family: 4 });
  assert.throws(() => createPinnedDnsLookup("not-an-ip"));
});

test("pinned native IPv6 family does not require DNS re-resolution", async () => {
  const lookup = createPinnedDnsLookup("2001:4860:4860::8888") as unknown as (
    hostname: string, options: { all: boolean },
    callback: (error: Error | null, addresses: unknown) => void
  ) => void;
  const records = await new Promise<unknown>((resolve, reject) =>
    lookup("example.invalid", { all: true }, (error, addresses) => error ? reject(error) : resolve(addresses))
  );
  assert.deepEqual(records, [{ address: "2001:4860:4860::8888", family: 6 }]);
});
