import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@/lib/prisma";
import { WhatsAppManager } from "@/modules/whatsapp/manager";

function mockDelegate(t: TestContext, delegate: object, method: string, replacement: unknown) {
    const original = Object.getOwnPropertyDescriptor(delegate, method);
    Object.defineProperty(delegate, method, { configurable: true, value: replacement });
    t.after(() => {
        if (original) Object.defineProperty(delegate, method, original);
        else Reflect.deleteProperty(delegate, method);
    });
}

test("an unexpired owner is not replaced and does not emit a primary-key exception", async (t) => {
    const manager = WhatsAppManager.getInstance();
    const sessionId = "lease-active-fixture";
    let updates = 0;
    let creates = 0;
    mockDelegate(t, prisma.whatsAppSessionLease, "updateMany", async () => {
        updates++;
        return { count: 0 };
    });
    mockDelegate(t, prisma.whatsAppSessionLease, "createMany", async (args: { skipDuplicates?: boolean }) => {
        assert.equal(args.skipDuplicates, true);
        creates++;
        return { count: 0 };
    });
    assert.equal(await manager["acquireSessionLease"](sessionId, "tenant-fixture"), false);
    assert.equal(updates, 2);
    assert.equal(creates, 1);
    assert.equal(manager["leaseTokens"].has(sessionId), false);
});

test("an expired row can be acquired after concurrent insertion without deleting it", async (t) => {
    const manager = WhatsAppManager.getInstance();
    const sessionId = "lease-expired-fixture";
    let updates = 0;
    mockDelegate(t, prisma.whatsAppSessionLease, "updateMany", async (args: { where: { leaseUntil?: unknown; OR?: unknown }; data: { fencingToken?: unknown } }) => {
        updates++;
        if (updates === 2) {
            assert.ok(args.where.leaseUntil);
            assert.deepEqual(args.data.fencingToken, { increment: 1 });
        }
        return { count: updates === 2 ? 1 : 0 };
    });
    mockDelegate(t, prisma.whatsAppSessionLease, "createMany", async () => ({ count: 0 }));
    assert.equal(await manager["acquireSessionLease"](sessionId, "tenant-fixture"), true);
    assert.equal(updates, 2);
    assert.equal(manager["leaseTokens"].has(sessionId), true);
    t.after(() => {
        const timer = manager["leaseTimers"].get(sessionId);
        if (timer) clearInterval(timer);
        manager["leaseTimers"].delete(sessionId);
        manager["leaseTokens"].delete(sessionId);
    });
});

test("an unowned row is inserted without a second update", async (t) => {
    const manager = WhatsAppManager.getInstance();
    const sessionId = "lease-new-fixture";
    let updates = 0;
    mockDelegate(t, prisma.whatsAppSessionLease, "updateMany", async () => {
        updates++;
        return { count: 0 };
    });
    mockDelegate(t, prisma.whatsAppSessionLease, "createMany", async () => ({ count: 1 }));
    assert.equal(await manager["acquireSessionLease"](sessionId, "tenant-fixture"), true);
    assert.equal(updates, 1);
    t.after(() => {
        const timer = manager["leaseTimers"].get(sessionId);
        if (timer) clearInterval(timer);
        manager["leaseTimers"].delete(sessionId);
        manager["leaseTokens"].delete(sessionId);
    });
});

test("stopping a session cancels a pending ownership retry", async () => {
    const manager = WhatsAppManager.getInstance();
    const sessionId = "lease-retry-fixture";
    manager["scheduleLeaseRetry"](sessionId, "tenant-fixture");
    assert.equal(manager["leaseRetries"].has(sessionId), true);
    await manager.stopSession(sessionId);
    assert.equal(manager["leaseRetries"].has(sessionId), false);
});
