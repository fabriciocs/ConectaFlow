import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

// Next.js 16 reads AsyncLocalStorage from globalThis when running through a
// custom server. Node exposes the implementation from node:async_hooks, but
// does not make it global on every supported runtime (including Node 24).
// Install the native implementation before importing the Next server module.
if (typeof globalThis.AsyncLocalStorage !== "function") {
    Object.defineProperty(globalThis, "AsyncLocalStorage", {
        configurable: true,
        value: AsyncLocalStorage,
        writable: true,
    });
}

// Set production mode before importing Next.js or the WA-AKG server modules.
process.env.NODE_ENV = "production";
loadEnvConfig(process.cwd());

await import("../src/server/index.ts");
