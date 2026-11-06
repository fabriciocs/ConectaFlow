import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { WASocket } from "@whiskeysockets/baileys";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WhatsAppManager } from "@/modules/whatsapp/manager";
import type { WhatsAppInstance } from "@/modules/whatsapp/instance";
import { bindContactSync } from "@/modules/whatsapp/store/contacts";

const binding = { sessionId: "fixture-session", tenantId: "tenant-a", userId: "owner-a" };
const session = { ...binding, id: "fixture-session-db" };

function mockDelegate(t: TestContext, delegate: object, method: string, replacement: unknown) {
    const original = Object.getOwnPropertyDescriptor(delegate, method);
    Object.defineProperty(delegate, method, { configurable: true, value: replacement });
    t.after(() => {
        if (original) Object.defineProperty(delegate, method, original);
        else Reflect.deleteProperty(delegate, method);
    });
}

function mockSessionMembership(t: TestContext) {
    const membership: {
        tenantId: string;
        status: "ACTIVE" | "REVOKED";
        revokedAt: Date | null;
    } = { tenantId: binding.tenantId, status: "ACTIVE", revokedAt: null };
    mockDelegate(t, prisma.session, "findUnique", async ({ where }: { where: Prisma.SessionWhereUniqueInput }) => {
        if (!where.user) {
            assert.deepEqual(where, { sessionId: binding.sessionId });
            return session;
        }
        assert.equal(where.sessionId, binding.sessionId);
        assert.equal(where.tenantId, binding.tenantId);
        assert.equal(where.userId, binding.userId);
        assert.deepEqual(where.tenant, { status: "ACTIVE", suspendedAt: null });
        const filter = where.user as Prisma.UserWhereInput;
        assert.deepEqual(filter.tenantMemberships?.some, {
            tenantId: binding.tenantId,
            status: "ACTIVE",
            revokedAt: null,
        });
        const required = filter.tenantMemberships!.some!;
        return required.tenantId === membership.tenantId && required.status === membership.status &&
            required.revokedAt === membership.revokedAt ? session : null;
    });
    return membership;
}

test("renewal stops an existing WhatsApp worker when its owner membership is revoked", async (t) => {
    const membership = mockSessionMembership(t);
    const manager = WhatsAppManager.getInstance();
    let renewals = 0;
    let shutdowns = 0;
    mockDelegate(t, prisma.whatsAppSessionLease, "updateMany", async () => {
        renewals++;
        return { count: 1 };
    });
    manager["sessions"].set(binding.sessionId, {
        ...binding,
        status: "CONNECTED",
        shutdown: async () => { shutdowns++; },
    } as unknown as WhatsAppInstance);
    const leaseToken = "fixture-lease-token";
    manager["leaseTokens"].set(binding.sessionId, leaseToken);
    t.after(() => {
        manager["sessions"].delete(binding.sessionId);
        manager["leaseTokens"].delete(binding.sessionId);
    });

    await manager.startSession(binding.sessionId);
    await manager["renewSessionLease"](binding.sessionId, binding.tenantId, leaseToken);
    assert.equal(renewals, 1);
    assert.equal(shutdowns, 0);

    membership.status = "REVOKED";
    membership.revokedAt = new Date();
    await assert.rejects(manager.startSession(binding.sessionId), /Session not found/);
    await manager["renewSessionLease"](binding.sessionId, binding.tenantId, leaseToken);
    assert.equal(renewals, 1);
    assert.equal(shutdowns, 1);
    assert.equal(manager.getInstance(binding.sessionId), undefined);
});

test("contact callbacks stop persisting when the bound owner loses membership", async (t) => {
    const membership = mockSessionMembership(t);
    let persistCount = 0;
    mockDelegate(t, prisma.contact, "upsert", async ({ create }: { create: Prisma.ContactUncheckedCreateInput }) => {
        assert.equal(create.tenantId, binding.tenantId);
        assert.equal(create.sessionId, session.id);
        persistCount++;
    });
    let onContactUpdate: ((updates: { id: string }[]) => Promise<void>) | undefined;
    const socket = {
        ev: {
            on(event: string, listener: typeof onContactUpdate) {
                if (event === "contacts.update") onContactUpdate = listener;
            },
        },
    } as unknown as WASocket;
    bindContactSync(socket, binding);
    assert.ok(onContactUpdate);
    await onContactUpdate([{ id: "fixture-contact" }]);
    assert.equal(persistCount, 1);

    membership.status = "REVOKED";
    membership.revokedAt = new Date();
    await onContactUpdate([{ id: "fixture-contact" }]);
    assert.equal(persistCount, 1);
});
