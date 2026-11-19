import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const targetArgumentIndex = process.argv.indexOf("--target");
const targetArgument = targetArgumentIndex >= 0 ? process.argv[targetArgumentIndex + 1] : undefined;
const targetRepo = path.resolve(targetArgument || process.env.WA_AKG_HARNESS_TARGET_REPO || path.resolve(harnessRoot, "..", "WA-AKG"));

async function commandAvailable(command, args = []) {
  try { await execFileAsync(command, args, { windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 }); return true; }
  catch { return false; }
}

async function dockerImageAvailable(image, dockerDaemon) {
  if (!dockerDaemon) return false;
  try { await execFileAsync("docker", ["image", "inspect", image], { windowsHide: true, timeout: 10_000, maxBuffer: 32 * 1024 }); return true; }
  catch { return false; }
}

async function fileExists(file) {
  try { await fs.access(file); return true; }
  catch { return false; }
}

async function main() {
  const dockerDaemon = await commandAvailable("docker", ["info"]);
  const checks = {
    dockerDaemon,
    waAkgImage: await dockerImageAvailable(process.env.WA_AKG_IMAGE || "wa-akg:local", dockerDaemon),
    mysqlImage: await dockerImageAvailable("mysql:8.0", dockerDaemon),
    redisImage: await dockerImageAvailable("redis:7-alpine", dockerDaemon),
    redisServerBinary: await commandAvailable("where", ["redis-server"]),
    replicaOverlay: await fileExists(path.join(targetRepo, "docker-compose.replicas.yml")),
    authStateKeyProvidedToHarness: Boolean(process.env.WA_AKG_AUTH_STATE_KEY?.trim()),
    targetDockerfile: await fileExists(path.join(targetRepo, "Dockerfile")),
  };
  const missing = [];
  if (!checks.dockerDaemon) missing.push("Docker daemon is unavailable");
  if (!checks.waAkgImage) missing.push("the WA-AKG image is not prebuilt; this harness will not build it automatically");
  if (!checks.mysqlImage) missing.push("an isolated MySQL image is not present; this harness will not pull it automatically");
  if (!checks.redisImage && !checks.redisServerBinary) missing.push("no Redis image or redis-server binary is available");
  if (!checks.authStateKeyProvidedToHarness) missing.push("WA_AKG_AUTH_STATE_KEY was not provided to the harness process");
  missing.push("no isolated database was provisioned or migrated by this read-only preflight");
  missing.push("no proxy affinity and no two full Next/Socket.IO/Baileys processes were started by this preflight");
  process.stdout.write(JSON.stringify({
    status: "NOT_VERIFIED", scope: "full-wa-akg-replicas", targetRepo, checks, missing,
    safety: ["read-only command probes only", "no image pull or build", "no container, volume, database, Redis, migration, WhatsApp, proxy or external API mutation", "no secret values are printed"],
  }, null, 2) + "\n");
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
