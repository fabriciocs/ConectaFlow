/**
 * Local-only regression gate: prove the build does not trace or copy private media.
 * Uses a unique synthetic canary; never reads or modifies existing user media.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createReadStream, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = path.join(root, "data", "media");
const privateRoots = [path.join(root, "data"), path.join(root, ".remote-desktop"), path.join(root, ".git")];
const outDir = path.join(root, ".next");
const id = "private-build-" + new Date().toISOString().replace(/[:.]/g, "-");
const evidence = path.join(root, ".remote-desktop", "sessions", id);
const rawDir = path.join(evidence, "raw");
const checksDir = path.join(evidence, "evidence");
const canaryName = "wa-akg-private-build-canary-" + randomBytes(10).toString("hex") + ".txt";
const canaryFile = path.join(media, canaryName);
const canary = Buffer.from("WA_AKG_PRIVATE_BUILD_CANARY_" + randomBytes(32).toString("hex"));
const traceTag = /(^|[/\\])data[/\\]media([/\\]|$)/i;

function* listFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (dir === outDir && ["cache", "dev"].includes(entry.name)) continue;
    const current = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) yield { path: current, symlink: true };
    else if (entry.isDirectory()) yield* listFiles(current);
    else if (entry.isFile()) yield { path: current, symlink: false };
  }
}
async function containsCanary(file, needle) {
  const stream = createReadStream(file, { highWaterMark: 65536 });
  let tail = Buffer.alloc(0);
  for await (const chunk of stream) {
    const combined = Buffer.concat([tail, chunk]);
    if (combined.includes(needle)) return true;
    tail = combined.subarray(Math.max(0, combined.length - needle.length + 1));
  }
  return false;
}
function belongsToMedia(file) {
  const full = path.resolve(file);
  return full === media || full.startsWith(media + path.sep);
}
function belongsToPrivateRuntime(file) {
  const full = path.resolve(file);
  if (privateRoots.some(base => full === base || full.startsWith(base + path.sep))) return true;
  return path.dirname(full) === root && /^\.env(?:\..+)?$/i.test(path.basename(full)) && path.basename(full) !== ".env.example";
}
function privateArtifactPath(relativePath) {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  return parts.some((part) => part === "data" || part === ".remote-desktop" || part === ".git" ||
    (/^\.env(?:\..+)?$/i.test(part) && part !== ".env.example"));
}
async function main() {
  if (!existsSync(media) || !lstatSync(media).isDirectory()) {
    throw new Error("PRIVATE_MEDIA_DIRECTORY_NOT_FOUND");
  }
  const bin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(bin)) throw new Error("LOCAL_NEXT_NOT_FOUND");
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(checksDir, { recursive: true });
  writeFileSync(canaryFile, canary, { flag: "wx", mode: 0o600 });
  let result;
  let canaryCleaned = false;
  try {
    const started = Date.now();
    result = spawnSync(process.execPath, [bin, "build"], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    writeFileSync(path.join(rawDir, "build.stdout.log"), stdout);
    writeFileSync(path.join(rawDir, "build.stderr.log"), stderr);
    const buildCode = result.status ?? 1;
    const warningCount = (stdout + stderr).split(/Overly broad patterns can lead to build performance issues/).length - 1;
    const files = [...listFiles(outDir)];
    let tracedMedia = 0;
    let copiedMedia = 0;
    let tracedPrivateRuntime = 0;
    let copiedPrivateRuntime = 0;
    let canaryHits = 0;
    let traceFiles = 0;
    let scannedFiles = 0;
    for (const file of files) {
      const rel = path.relative(outDir, file.path);
      if (traceTag.test(rel)) copiedMedia++;
      if (privateArtifactPath(rel)) copiedPrivateRuntime++;
      if (file.symlink) {
        // Symlinks are not leaks unless their target points into private media.
        try {
          const target = realpathSync(file.path);
          if (belongsToMedia(target)) copiedMedia++;
          if (belongsToPrivateRuntime(target)) copiedPrivateRuntime++;
        } catch {
          // Unresolvable symlinks are not legitimate deployable artifacts.
          copiedMedia++;
        }
        continue;
      }
      scannedFiles++;
      if (file.path.endsWith(".nft.json")) {
        traceFiles++;
        const json = JSON.parse(readFileSync(file.path, "utf8"));
        for (const entry of json.files ?? []) {
          const resolved = path.resolve(path.dirname(file.path), entry);
          if (belongsToMedia(resolved) || traceTag.test(String(entry))) tracedMedia++;
          if (belongsToPrivateRuntime(resolved)) tracedPrivateRuntime++;
        }
      }
      if (await containsCanary(file.path, canary)) canaryHits++;
    }
    const summary = {
      status: buildCode === 0 && warningCount === 0 && tracedMedia === 0 &&
        copiedMedia === 0 && tracedPrivateRuntime === 0 && copiedPrivateRuntime === 0 &&
        canaryHits === 0 && scannedFiles > 0 ? "VERIFIED" : "FAILED",
      buildExitCode: buildCode, buildDurationMs: Date.now() - started,
      overlyBroadWarnings: warningCount,
      tracedPrivateMediaReferences: tracedMedia,
      copiedPrivateMediaPaths: copiedMedia,
      tracedPrivateRuntimeReferences: tracedPrivateRuntime,
      copiedPrivateRuntimePaths: copiedPrivateRuntime,
      canaryContentOccurrences: canaryHits,
      traceManifestFiles: traceFiles, scannedBuildFiles: scannedFiles,
      scope: ".next excluding cache and dev; synthetic data/media canary",
      limitation: "This checks emitted build files and trace manifests, not all possible future deployment packaging",
    };
    writeFileSync(path.join(checksDir, "private-media-build.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify({ ...summary, evidence }));
    if (summary.status !== "VERIFIED") process.exitCode = 1;
  } finally {
    if (existsSync(canaryFile) && readFileSync(canaryFile).equals(canary)) {
      unlinkSync(canaryFile);
      canaryCleaned = true;
    }
    writeFileSync(path.join(checksDir, "canary-cleanup.json"), JSON.stringify({ ownSyntheticCanaryCleaned: canaryCleaned }) + "\n");
    if (!canaryCleaned) process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error("BUILD_MEDIA_AUDIT_BLOCKED: " + (error?.code || error?.message || "unknown"));
  process.exitCode = 1;
});