# Setup and execution

The supported entrypoint for configuring a local WA-AKG instance is:

```text
npm run setup
```

The command invokes the Node.js configurator and is intended to behave consistently on Windows, Linux and macOS. Run it from the repository root after `npm install`.

## First run

When no local configuration exists, the wizard asks for the required settings, validates the values it can validate locally, and creates the configuration needed by the selected execution mode. Secret values are entered interactively and are not echoed or printed in diagnostic output.

## Existing or older configuration

If a configuration already exists, the wizard reports that state and offers:

- keep the current configuration and continue;
- configure again, reviewing values interactively;
- cancel without changing files.

If the configuration belongs to an older format, the wizard creates a timestamped backup before migration. Known values are preserved, new required values are requested, and the backup should be retained until the instance is verified. To recover, stop the instance, restore the appropriate backup, and run `npm run setup` again.

## Execution modes

### Development

```bash
npm run setup
npm run dev
```

### Production

```bash
npm run setup
node scripts/setup.mjs --mode=production
```

In production mode, the wizard confirms migration execution and separately asks whether a V2 baseline is allowed **only on a verified empty database**. The migration router checks database lineage, exact target name and applied checksums before running Prisma. Any mismatch blocks build and startup. For automation, use `--non-interactive --apply-migrations`; add `--allow-empty-v2` only after explicitly approving a fresh V2 bootstrap. See [Prisma Bootstrap V2](PRISMA-BOOTSTRAP-V2.md) for guards, validation and known legacy checksum blockers.

The production process runs in the foreground. Put a TLS reverse proxy in front of a loopback binding for public access, configure firewall rules before selecting `0.0.0.0`, and back up the database before migration. The wizard does not install PM2, systemd, Windows services or launchd; use an already-approved supervisor separately when required.

### Docker Compose

```bash
npm run setup
docker compose build app
docker compose --profile ops run --rm migrate
docker compose up -d db app
```

The Compose `migrate` job now uses the guarded Prisma V2 router. On a proven-empty database it refuses to bootstrap unless `WA_AKG_ALLOW_EMPTY_V2_BOOTSTRAP=true` is explicitly supplied for that operation; the default is `false`. Existing V1 databases are checksum-checked before any deployment. Follow [Prisma Bootstrap V2](PRISMA-BOOTSTRAP-V2.md) and [Database Setup](DATABASE_SETUP.md); never run the baseline on an existing database.

## Platform notes

- Windows: run `npm run setup` from PowerShell or Command Prompt; Docker Desktop is required only for Docker mode. Node.js 22/24 cannot directly spawn npm/npx `.cmd` wrappers with `shell: false`; the wizard uses a Windows command shell only for its fixed, validated arguments. If an older version failed with `spawn EINVAL` at `[1/3]`, retain the `.env` backup, update the wizard and rerun the setup after verifying the database. For a non-mutating check, run `node --test scripts/setup.test.mjs` and `npx --no-install prisma migrate status`.
- Linux: run from a shell with Node.js installed; ensure the configured port and database are reachable by the service account.
- macOS: run from Terminal; Docker Desktop is required only for Docker mode.

## Media files and production builds

Media stored in the private `data/media` directory is runtime data, not part of the Next.js application bundle. The `GET /api/media`, `GET /api/media/[filename]`, and `DELETE /api/media` handlers keep their existing authentication and session checks, while targeted `turbopackIgnore` annotations prevent Turbopack from tracing user media into the build when composing runtime file paths. Keep `data/media` available to the application when running the production bundle; do not move or delete it during deployment. Verify a full `npm run build` reaches route generation and returns exit code 0; `Compiled successfully` alone is not proof of a completed build.

## Security limits

The configurator is local setup assistance, not a deployment or authorization boundary. It does not deploy, push, reset databases, delete data, expose administrative ports, or install global process managers. Keep `.env` and generated backups out of source control, use unique secrets, bind local development services to loopback where appropriate, and do not place real credentials in documentation or shell history. Database migrations, reverse-proxy exposure, WhatsApp sessions and external service changes require separate operational review.
