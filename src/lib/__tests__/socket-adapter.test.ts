import assert from "node:assert/strict";
import test from "node:test";
import { resolveSocketIoRedisConfig } from "@/server/socket-adapter";

test("Socket.IO stays local unless distributed mode is configured", () => {
  assert.equal(resolveSocketIoRedisConfig({ SOCKET_IO_DISTRIBUTED: "false" }), null);
});

test("distributed Socket.IO mode requires a Redis URL", () => {
  assert.throws(
    () => resolveSocketIoRedisConfig({ SOCKET_IO_DISTRIBUTED: "true" }),
    /requires SOCKET_IO_REDIS_URL/,
  );
});

test("Socket.IO Redis configuration accepts redis and rediss URLs without exposing them", () => {
  assert.deepEqual(resolveSocketIoRedisConfig({
    SOCKET_IO_DISTRIBUTED: "true",
    SOCKET_IO_REDIS_URL: "rediss://socket-user:socket-password@example.test:6380/0",
    SOCKET_IO_REDIS_KEY: "wa-akg:socket",
  }), {
    url: "rediss://socket-user:socket-password@example.test:6380/0",
    key: "wa-akg:socket",
  });
});

test("Socket.IO Redis configuration rejects unsafe transport and channel values", () => {
  assert.throws(
    () => resolveSocketIoRedisConfig({ SOCKET_IO_REDIS_URL: "https://example.test" }),
    /redis:\/\/ or rediss:\/\//,
  );
  assert.throws(
    () => resolveSocketIoRedisConfig({ SOCKET_IO_REDIS_URL: "redis://example.test", SOCKET_IO_REDIS_KEY: "wa akg" }),
    /bounded safe characters/,
  );
});
