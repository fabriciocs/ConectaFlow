import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    createPrivateConnectionUpdate,
    createPublicConnectionUpdate,
    getSessionPrivateRoom,
    getSessionPublicRoom,
    mayReceivePrivateSessionEvent
} from "../../server/socket";

describe("Socket.IO session secret isolation", () => {
    it("uses separate public and private rooms", () => {
        assert.equal(getSessionPublicRoom("session-1"), "session:public:session-1");
        assert.equal(getSessionPrivateRoom("session-1"), "session:session-1:private");
        assert.notEqual(getSessionPublicRoom("session-1"), getSessionPrivateRoom("session-1"));
    });

    it("keeps public and private namespaces disjoint for delimiter-like ids", () => {
        const sessionId = "victim-private";
        assert.notEqual(getSessionPublicRoom(`private:${sessionId}`), getSessionPrivateRoom(sessionId));
    });

    it("does not put secrets in public connection updates", () => {
        const update = createPublicConnectionUpdate("SCAN_QR");
        assert.deepEqual(update, { status: "SCAN_QR" });
        assert.equal("qr" in update, false);
        assert.equal("pairingCode" in update, false);
    });

    it("keeps QR and pairing data in private updates", () => {
        assert.deepEqual(
            createPrivateConnectionUpdate("SCAN_QR", "qr-secret", "pair-secret"),
            { status: "SCAN_QR", qr: "qr-secret", pairingCode: "pair-secret" }
        );
    });

    it("only permits the current owner or an active superadmin", () => {
        assert.equal(mayReceivePrivateSessionEvent({ id: "owner", role: "USER", emailVerified: true }, "owner"), true);
        assert.equal(mayReceivePrivateSessionEvent({ id: "admin", role: "SUPERADMIN", emailVerified: true }, "owner"), true);
        assert.equal(mayReceivePrivateSessionEvent({ id: "admin", role: "SUPERADMIN", emailVerified: false }, "owner"), false);
        assert.equal(mayReceivePrivateSessionEvent({ id: "other", role: "USER", emailVerified: true }, "owner"), false);
    });
});
