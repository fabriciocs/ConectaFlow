import { createRequire } from "node:module";

const mode = process.argv[2];
if (mode !== "development" && mode !== "production") {
  throw new Error("Expected startup mode: development or production");
}

process.env.NODE_ENV = mode;

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

await import("../src/server/index.ts");
