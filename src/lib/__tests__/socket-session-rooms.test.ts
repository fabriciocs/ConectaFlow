import { createServer } from "node:http";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/tenant-api-keys";
import {
    createPrivateConnectionUpdate,
    createPublicConnectionUpdate,
    emitSessionRoomEvent,
    getSessionPrivateRoom,
    getSessionPublicRoom,
    setupSocket,
} from "../../server/socket";

describe("Socket.IO session secret isolation", () => {
    it("separates rooms by tenant and event visibility", () => {
        assert.equal(getSessionPublicRoom("tenant-a", "session-1"), "tenant:tenant-a:session:public:session-1");
        assert.equal(getSessionPrivateRoom("tenant-a", "session-1"), "tenant:tenant-a:session:private:session-1");
        assert.notEqual(getSessionPublicRoom("tenant-a", "session-1"), getSessionPublicRoom("tenant-b", "session-1"));
        assert.notEqual(getSessionPublicRoom("tenant-a", "session-1"), getSessionPrivateRoom("tenant-a", "session-1"));
    });

    it("does not put secrets in public connection updates", () => {
        assert.deepEqual(createPublicConnectionUpdate("SCAN_QR"), { status: "SCAN_QR" });
        assert.deepEqual(createPrivateConnectionUpdate("SCAN_QR", "qr-secret", "pair-secret"),
            { status: "SCAN_QR", qr: "qr-secret", pairingCode: "pair-secret" });
    });

    it("revalidates tenant membership and API key rotation before room delivery", { timeout: 30000 }, async (t) => {
        const previousSecret = process.env.AUTH_SECRET;
        const secret = "synthetic-socket-fixture-for-tenant-room-test";
        process.env.AUTH_SECRET = secret;
        t.after(() => {
            if (previousSecret === undefined) delete process.env.AUTH_SECRET;
            else process.env.AUTH_SECRET = previousSecret;
        });

        const session = { id: "session-db", sessionId: "session-1", tenantId: "tenant-a", userId: "owner-a" };
        const users = [
            { id: "owner-a", role: "USER", emailVerified: true },
            { id: "member-a", role: "USER", emailVerified: true },
            { id: "admin-b", role: "SUPERADMIN", emailVerified: true },
        ];
        let ownerActive = true;
        const restores: Array<() => void> = [];
        const mockDelegate = (delegate: object, method: string, replacement: unknown) => {
            const original = Object.getOwnPropertyDescriptor(delegate, method);
            Object.defineProperty(delegate, method, { configurable: true, value: replacement });
            restores.push(() => original ? Object.defineProperty(delegate, method, original) : Reflect.deleteProperty(delegate, method));
        };
        t.after(() => { for (const restore of restores.reverse()) restore(); });
        mockDelegate(prisma.user, "findUnique", async ({ where }: { where: { id: string } }) =>
            users.find(user => user.id === where.id) ?? null);
        mockDelegate(prisma.tenantMembership, "findFirst", async ({ where }: { where: { userId: string; tenantId: string } }) =>
            (where.tenantId === "tenant-a" && (where.userId === "member-a" || (where.userId === "owner-a" && ownerActive))) ||
            (where.tenantId === "tenant-b" && where.userId === "admin-b")
                ? { tenantId: where.tenantId, role: "OWNER", status: "ACTIVE" }
                : null);
        mockDelegate(prisma.session, "findFirst", async ({ where }: { where: { tenantId: string } }) =>
            where.tenantId === session.tenantId ? session : null);
        mockDelegate(prisma.session, "findUnique", async ({ where }: { where: { tenantId: string } }) =>
            where.tenantId === session.tenantId ? session : null);
        mockDelegate(prisma.resourceGrant, "findMany", async () => []);
        let activeKeyHash: string | null = hashApiKey("synthetic-initial-key");
        const credential = {
            id: "managed-credential",
            userId: session.userId,
            tenantId: session.tenantId,
            scopes: ["api:read"],
            user: { id: session.userId, email: "owner@example.invalid", name: null, emailVerified: true },
        };
        mockDelegate(prisma.apiCredential, "findFirst", async ({ where }: { where: { keyHash?: string; id?: string } }) => {
            if (!activeKeyHash || (where.keyHash && where.keyHash !== activeKeyHash) ||
                (where.id && where.id !== credential.id)) return null;
            return { ...credential, keyHash: activeKeyHash };
        });
        mockDelegate(prisma.apiCredential, "updateMany", async ({ where }: { where: { keyHash: string } }) =>
            ({ count: where.keyHash === activeKeyHash ? 1 : 0 }));

        const http = createServer();
        const io = new Server(http);
        setupSocket(io);
        const clients: Socket[] = [];
        t.after(async () => {
            for (const client of clients) client.disconnect();
            await io.close();
        });

        await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
        const address = http.address();
        assert.ok(address && typeof address === "object");
        const { port } = address;

        async function openClient(extraHeaders: Record<string, string>) {
            const client = connect(`http://127.0.0.1:${port}`, {
                forceNew: true,
                reconnection: false,
                transports: ["websocket"],
                extraHeaders,
            });
            clients.push(client);
            await new Promise<void>((resolve, reject) => {
                client.once("connect", resolve);
                client.once("connect_error", reject);
            });
            return client;
        }

        async function openSocket(userId: string, tenantId: string) {
            const name = "authjs.session-token";
            const token = await encode({ token: { id: userId }, secret, salt: name });
            return openClient({ cookie: `${name}=${token}; wa-akg-tenant=${tenantId}` });
        }

        const owner = await openSocket("owner-a", "tenant-a");
        const member = await openSocket("member-a", "tenant-a");
        const admin = await openSocket("admin-b", "tenant-b");

        for (const denied of [member, admin]) {
            const rejection = new Promise(resolve => denied.once("error", resolve));
            denied.emit("join-session", session.sessionId);
            assert.deepEqual(await rejection, { message: "Forbidden - Cannot access this session" });
        }

        const privateRoom = getSessionPrivateRoom(session.tenantId, session.sessionId);
        const roomJoined = new Promise<void>(resolve => {
            io.of("/").adapter.on("join-room", (room, socketId) => {
                if (room === privateRoom && socketId === owner.id) resolve();
            });
        });
        owner.emit("join-session", session.sessionId);
        await roomJoined;

        const firstEvent = new Promise(resolve => owner.once("connection.update", resolve));
        const payload = createPrivateConnectionUpdate("SCAN_QR", "fixture-only");
        await emitSessionRoomEvent(io, session.tenantId, session.sessionId, "connection.update", payload, "private");
        assert.deepEqual(await firstEvent, payload);

        ownerActive = false;
        await emitSessionRoomEvent(io, session.tenantId, session.sessionId, "connection.update", payload, "private");
        assert.equal((await io.in(privateRoom).fetchSockets()).length, 0);

        ownerActive = true;
        const publicRoom = getSessionPublicRoom(session.tenantId, session.sessionId);
        const roomMemberIds = async () => (await io.in(publicRoom).fetchSockets()).map(socket => socket.id);
        async function joinPublicRoom(client: Socket) {
            await new Promise<void>(resolve => {
                function onJoin(room: string, socketId: string) {
                    if (room !== publicRoom || socketId !== client.id) return;
                    io.of("/").adapter.off("join-room", onJoin);
                    resolve();
                }
                io.of("/").adapter.on("join-room", onJoin);
                client.emit("join-session", session.sessionId);
            });
        }
        const firstKey = await openClient({ "x-api-key": "synthetic-initial-key" });
        await joinPublicRoom(firstKey);
        activeKeyHash = hashApiKey("synthetic-rotated-key");
        const rotatedKey = await openClient({ "x-api-key": "synthetic-rotated-key" });
        await joinPublicRoom(rotatedKey);
        const publicPayload = createPublicConnectionUpdate("CONNECTED");
        const rotatedEvent = new Promise(resolve => rotatedKey.once("connection.update", resolve));
        await emitSessionRoomEvent(io, session.tenantId, session.sessionId, "connection.update", publicPayload);
        assert.deepEqual(await rotatedEvent, publicPayload);
        assert.ok(!(await roomMemberIds()).includes(firstKey.id!));

        // A revocation and reprovision can both happen between two deliveries.
        activeKeyHash = null;
        activeKeyHash = hashApiKey("synthetic-reprovisioned-key");
        await emitSessionRoomEvent(io, session.tenantId, session.sessionId, "connection.update", publicPayload);
        assert.ok(!(await roomMemberIds()).includes(rotatedKey.id!));
        const deniedJoin = new Promise(resolve => rotatedKey.once("error", resolve));
        rotatedKey.emit("join-session", session.sessionId);
        assert.deepEqual(await deniedJoin, { message: "Forbidden - Cannot access this session" });
        await assert.rejects(openClient({ "x-api-key": "synthetic-rotated-key" }), /Authentication required/);
        credential.user.emailVerified = false;
        await assert.rejects(openClient({ "x-api-key": "synthetic-reprovisioned-key" }), /Authentication required/);
    });
});
