import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

// Next.js 16 reads AsyncLocalStorage from globalThis in a custom server.
// Node exposes the native implementation through node:async_hooks instead.
if (typeof globalThis.AsyncLocalStorage !== "function") {
  Object.defineProperty(globalThis, "AsyncLocalStorage", {
    configurable: true,
    value: AsyncLocalStorage,
    writable: true,
  });
}

process.env.NODE_ENV = "development";
loadEnvConfig(process.cwd());

await import("../src/server/index.ts");
