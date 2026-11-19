import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Server } from "socket.io";
import { logger } from "../lib/logger";

const DEFAULT_REDIS_KEY = "wa-akg:socket.io";

export interface SocketIoRedisConfig {
  url: string;
  key: string;
}

export function resolveSocketIoRedisConfig(env: Record<string, string | undefined> = process.env): SocketIoRedisConfig | null {
  const rawUrl = env.SOCKET_IO_REDIS_URL?.trim();
  const distributed = env.SOCKET_IO_DISTRIBUTED === "true";
  if (!rawUrl) {
    if (distributed) throw new Error("SOCKET_IO_DISTRIBUTED=true requires SOCKET_IO_REDIS_URL");
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SOCKET_IO_REDIS_URL must be a valid redis:// or rediss:// URL");
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("SOCKET_IO_REDIS_URL must use redis:// or rediss://");
  }

  const key = env.SOCKET_IO_REDIS_KEY?.trim() || DEFAULT_REDIS_KEY;
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(key)) {
    throw new Error("SOCKET_IO_REDIS_KEY must contain only bounded safe characters");
  }
  return { url: rawUrl, key };
}

export async function configureSocketIoAdapter(io: Server) {
  const config = resolveSocketIoRedisConfig();
  if (!config) return null;

  const pubClient = createClient({ url: config.url });
  const subClient = pubClient.duplicate();
  const onRedisError = () => logger.error("Socket", "Socket.IO Redis adapter connection error");
  pubClient.on("error", onRedisError);
  subClient.on("error", onRedisError);

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient, { key: config.key }));
    logger.info("Socket", "Socket.IO distributed adapter enabled");
    return {
      async close() {
        await Promise.allSettled([pubClient.quit(), subClient.quit()]);
      },
    };
  } catch {
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    throw new Error("Socket.IO Redis adapter could not be initialized");
  }
}
