import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { canAccessSession } from "../lib/session-access";
import { logger } from "../lib/logger";
import { validateApiKeyValue } from "../lib/api-auth";
import { isValidSessionId } from "../lib/session-id";

export function getSessionPublicRoom(sessionId: string) {
    return `session:public:${sessionId}`;
}

export function getSessionPrivateRoom(sessionId: string) {
    return `session:${sessionId}:private`;
}

export function mayReceivePrivateSessionEvent(
    user: { id: string; role: string; emailVerified: boolean } | undefined,
    ownerId: string
) {
    return Boolean(user?.emailVerified && (user.id === ownerId || user.role === "SUPERADMIN"));
}

export function createPublicConnectionUpdate(status: string) {
    return { status };
}

export function createPrivateConnectionUpdate(
    status: string,
    qr: string | null = null,
    pairingCode: string | null = null
) {
    return { status, qr, pairingCode };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(";").forEach((cookie) => {
        const parts = cookie.split("=");
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join("=").trim();
            cookies[key] = decodeURIComponent(val);
        }
    });

    return cookies;
}

export function setupSocket(io: Server) {
    // 🔐 Socket.IO Authentication Middleware
    io.use(async (socket: Socket, next) => {
        try {
            const headers = socket.handshake.headers;
            const cookies = parseCookies(headers.cookie);

            // 1. Try NextAuth JWT session tokens (v4 and v5 cookie names)
            const tokenCookieNames = [
                "authjs.session-token",
                "__Secure-authjs.session-token",
                "next-auth.session-token",
                "__Secure-next-auth.session-token"
            ];

            const secret = process.env.AUTH_SECRET;

            let decodeJwt: typeof import("next-auth/jwt").decode | null = null;
            try {
                const jwtMod = await import("next-auth/jwt");
                decodeJwt = jwtMod.decode;
            } catch (err) {
                logger.debug("Socket", "next-auth/jwt module unavailable:", err);
            }

            if (decodeJwt && secret) {
                for (const cookieName of tokenCookieNames) {
                    const tokenVal = cookies[cookieName];
                    if (tokenVal) {
                        try {
                            const decoded = await decodeJwt({
                                token: tokenVal,
                                secret,
                                salt: cookieName
                            });

                            if (decoded && decoded.id) {
                                socket.data.user = {
                                    id: decoded.id as string,
                                    role: (decoded.role as string) || "USER",
                                    email: (decoded.email as string) || ""
                                };
                                return next();
                            }
                        } catch (e) {
                            logger.debug("Socket", `Failed decoding cookie ${cookieName}:`, e);
                        }
                    }
                }
            }

            // 2. Try API Key from auth payload or x-api-key header
            const headerApiKey = headers["x-api-key"];
            const apiKey =
                (typeof socket.handshake.auth?.apiKey === "string" ? socket.handshake.auth.apiKey : undefined) ||
                (typeof headerApiKey === "string" ? headerApiKey : undefined);

            if (apiKey && typeof apiKey === "string") {
                const user = await validateApiKeyValue(apiKey);

                if (user) {
                    socket.data.user = {
                        id: user.id,
                        role: user.role,
                        email: user.email
                    };
                    return next();
                }
            }

            // Reject unauthenticated sockets
            logger.warn("Socket", `Rejected unauthenticated connection attempt from ${socket.id} (IP: ${socket.handshake.address})`);
            return next(new Error("Authentication required"));

        } catch (err) {
            logger.error("Socket", "Error in Socket.IO auth middleware:", err);
            return next(new Error("Internal authentication error"));
        }
    });

    // 📡 Authenticated connection handler
    io.on("connection", (socket: Socket) => {
        const user = socket.data.user;
        logger.info("Socket", `Client connected: ${socket.id} (User: ${user?.id || "unknown"}, Role: ${user?.role || "unknown"})`);

        socket.on("disconnect", () => {
            logger.info("Socket", `Client disconnected: ${socket.id}`);
        });

        // 🛡️ Authorized Session Room Join
        socket.on("join-session", async (sessionId: unknown) => {
            try {
                if (!isValidSessionId(sessionId)) {
                    socket.emit("error", { message: "Invalid sessionId" });
                    return;
                }

                if (!socket.data.user) {
                    socket.emit("error", { message: "Unauthorized" });
                    return;
                }

                // Re-read the principal at the sensitive boundary. JWT role claims
                // may be stale after a role downgrade, suspension, or revocation.
                const currentUser = await prisma.user.findUnique({
                    where: { id: socket.data.user.id },
                    select: { id: true, role: true, emailVerified: true }
                });
                if (!currentUser || !currentUser.emailVerified) {
                    socket.emit("error", { message: "Unauthorized" });
                    return;
                }
                socket.data.user.role = currentUser.role;

                const session = await prisma.session.findFirst({
                    where: {
                        OR: [
                            { id: sessionId },
                            { sessionId }
                        ]
                    },
                    select: { sessionId: true, userId: true }
                });

                if (!session) {
                    socket.emit("error", { message: "Forbidden - Cannot access this session" });
                    return;
                }

                const canAccess = await canAccessSession(
                    currentUser.id,
                    currentUser.role,
                    session.sessionId
                );

                if (!canAccess) {
                    logger.warn("Socket", `Forbidden join-session attempt: User ${currentUser.id} tried to join session '${sessionId}'`);
                    socket.emit("error", { message: "Forbidden - Cannot access this session" });
                    return;
                }

                socket.join(getSessionPublicRoom(session.sessionId));

                // The public room is state-only. QR and pairing data belong to
                // a private room that only the owner or an active SUPERADMIN
                // may join.
                if (mayReceivePrivateSessionEvent(currentUser, session.userId)) {
                    socket.join(getSessionPrivateRoom(session.sessionId));
                    logger.debug("Socket", `Socket ${socket.id} (User: ${socket.data.user.id}) joined public/private session rooms for: ${session.sessionId}`);
                } else {
                    logger.debug("Socket", `Socket ${socket.id} (User: ${socket.data.user.id}) joined public-only session room for: ${session.sessionId}`);
                }
            } catch (err) {
                logger.error("Socket", `Error joining session ${String(sessionId)}:`, err);
                socket.emit("error", { message: "Error joining session room" });
            }
        });

        // 🛡️ Authorized User-specific Notification Room Join
        socket.on("join-user-room", async (userId: unknown) => {
            try {
            if (!userId || typeof userId !== "string") {
                socket.emit("error", { message: "Invalid userId" });
                return;
            }

            if (!socket.data.user) {
                socket.emit("error", { message: "Unauthorized" });
                return;
            }

            const currentUser = await prisma.user.findUnique({
                where: { id: socket.data.user.id },
                select: { id: true, role: true, emailVerified: true }
            });
            if (!currentUser || !currentUser.emailVerified) {
                socket.emit("error", { message: "Unauthorized" });
                return;
            }
            socket.data.user.role = currentUser.role;

            // Only allow joining own user room, unless SUPERADMIN
            if (currentUser.id !== userId && currentUser.role !== "SUPERADMIN") {
                logger.warn("Socket", `Forbidden join-user-room attempt: User ${socket.data.user.id} tried to join user:${userId}`);
                socket.emit("error", { message: "Forbidden - Cannot access other user room" });
                return;
            }

            socket.join(`user:${userId}`);
            logger.debug("Socket", `Socket ${socket.id} joined user room: user:${userId}`);
            } catch (err) {
                logger.error("Socket", "Error joining user room:", err);
                socket.emit("error", { message: "Error joining user room" });
            }
        });
    });
}
