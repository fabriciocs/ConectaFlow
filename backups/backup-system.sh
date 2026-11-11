#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  printf '%s\n' 'error: this script requires Bash; run: bash ./backup-system.sh' >&2
  exit 2
fi
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# Encrypted backup uploader. Run with Bash: bash ./backup-system.sh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOG_FILE="${BACKUP_LOG_FILE:-$SCRIPT_DIR/backup-audit.log}"
LOCK_FILE="${BACKUP_LOCK_FILE:-$SCRIPT_DIR/.backup.lock}"
RETRY_MAX="${BACKUP_RETRY_MAX:-4}"
RETRY_DELAY="${BACKUP_RETRY_DELAY:-2}"
REQUESTED_DRY_RUN="${DRY_RUN-}"
CONTROL_DIR="${BACKUP_CONTROL_DIR:-$SCRIPT_DIR/.backup-control}"
PID_FILE="$CONTROL_DIR/backup.pid"
STATE_FILE="$CONTROL_DIR/state"
ACTION="${1:-run}"
EXECUTION_STARTED=0
AUDIT_BUSY=0

redact() {
  local value="$*"
  [[ -n "${GITHUB_TOKEN:-}" ]] && value="${value//${GITHUB_TOKEN}/[REDACTED]}"
  [[ -n "${GPG_PASSPHRASE:-}" ]] && value="${value//${GPG_PASSPHRASE}/[REDACTED]}"
  printf '%s' "$value"
}

log() {
  local level="$1"; shift
  local line
  line="$(date -u +'%Y-%m-%dT%H:%M:%SZ') [$level] run=$RUN_ID $(redact "$*")"
  printf '%s\n' "$line" | tee -a "$LOG_FILE" >&2
}

audit_debug() {
  [[ "$AUDIT_BUSY" == 1 ]] && return 0
  AUDIT_BUSY=1
  log DEBUG "cmd=$(redact "${BASH_COMMAND//$'\n'/ }")"
  AUDIT_BUSY=0
}

die() { log ERROR "$*"; exit 1; }
on_error() {
  local code=$? line=${BASH_LINENO[0]:-unknown} cmd=${BASH_COMMAND:-unknown}
  log ERROR "failed exit=$code line=$line cmd=$(redact "$cmd")"
  exit "$code"
}
cleanup() {
  local code=$?
  [[ -n "${ASKPASS_FILE:-}" && -e "$ASKPASS_FILE" ]] && rm -f -- "$ASKPASS_FILE"
  [[ -n "${stage:-}" && -d "$stage" ]] && rm -rf -- "$stage"
  [[ -f "$PID_FILE" && "$(cat "$PID_FILE" 2>/dev/null || true)" == "$$" ]] && rm -f -- "$PID_FILE"
  flock -u 9 2>/dev/null || true
  if [[ "$EXECUTION_STARTED" == 1 ]]; then
    [[ "$code" -eq 0 ]] && { write_state completed; log INFO "cleanup complete"; } || { write_state failed; log WARN "cleanup after failure exit=$code"; }
  fi
  return "$code"
}
trap on_error ERR
trap cleanup EXIT
trap 'log WARN "interrupted"; exit 130' INT TERM

retry() {
  local attempt=1 delay="$RETRY_DELAY" label="$1"; shift
  while true; do
    log INFO "attempt=$attempt/$RETRY_MAX operation=$label"
    if "$@"; then return 0; fi
    (( attempt >= RETRY_MAX )) && return 1
    log WARN "operation=$label failed; retrying in ${delay}s"
    sleep "$delay"
    (( delay *= 2 ))
    (( attempt++ ))
  done
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
validate_name() { [[ "$1" =~ ^[A-Za-z0-9_.-]+$ ]] || die "invalid GitHub name: $1"; }

write_state() {
  mkdir -p -- "$CONTROL_DIR"
  chmod 700 "$CONTROL_DIR"
  printf '%s\n' "$1" > "$STATE_FILE"
  chmod 600 "$STATE_FILE"
}

running_pid() {
  [[ -s "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s\n' "$pid"
}

control_status() {
  local pid state='idle'
  if pid="$(running_pid)"; then state="$(cat "$STATE_FILE" 2>/dev/null || printf running)"; fi
  printf 'state=%s\n' "$state"
  if [[ -n "${pid:-}" ]]; then printf 'pid=%s\n' "$pid"; fi
}

control_signal() {
  local signal="$1" label="$2" pid
  pid="$(running_pid)" || die "no active backup execution"
  kill "-$signal" -- "-$pid" 2>/dev/null || kill "-$signal" "$pid" || die "could not $label execution pid=$pid"
  log WARN "execution=$label pid=$pid"
}

control_start() {
  if running_pid >/dev/null; then die "backup execution already running"; fi
  log INFO "starting backup execution"
  exec setsid "$0" run
}

control_restart() {
  if running_pid >/dev/null; then
    control_signal TERM restart
    for _ in {1..20}; do running_pid >/dev/null || break; sleep 1; done
    running_pid >/dev/null && control_signal KILL abort
  fi
  control_start
}

control_abort() {
  local pid
  pid="$(running_pid)" || die "no active backup execution"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in {1..10}; do running_pid >/dev/null || { log WARN "execution=aborted pid=$pid"; return 0; }; sleep 1; done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  rm -f -- "$PID_FILE"
  write_state aborted
  log WARN "execution=force-aborted pid=$pid"
}

control_rollback() {
  local repo_dir latest
  running_pid >/dev/null && die "stop the active execution before rollback"
  [[ "$GITHUB_VISIBILITY" == private ]] || die "rollback requires a private repository"
  repo_dir="$(mktemp -d "$BACKUP_STAGING_DIR/rollback.XXXXXX")"
  trap 'rm -rf -- "$repo_dir"' RETURN
  log WARN "rollback requested; removing latest encrypted backup from $GITHUB_OWNER/$GITHUB_REPO"
  ASKPASS_FILE="$repo_dir/git-askpass.sh"
  printf '%s\n' '#!/usr/bin/env bash' 'case "$1" in *Username*) printf "%s" "x-access-token" ;; *) printf "%s" "$GITHUB_TOKEN" ;; esac' > "$ASKPASS_FILE"
  chmod 700 "$ASKPASS_FILE"
  export GIT_ASKPASS="$ASKPASS_FILE" GIT_TERMINAL_PROMPT=0
  retry rollback-clone gh repo clone "$GITHUB_OWNER/$GITHUB_REPO" "$repo_dir/repo"
  latest="$(find "$repo_dir/repo" -maxdepth 1 -type f -name 'system-backup-*.tar.gz.age' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2- )"
  [[ -n "$latest" ]] || die "no encrypted backup found to roll back"
  rm -f -- "$latest" "${latest}.sha256"
  git -C "$repo_dir/repo" add --all
  git -C "$repo_dir/repo" -c user.name=system-backup -c user.email=system-backup@localhost commit -q -m "rollback: remove latest backup"
  retry rollback-push git -C "$repo_dir/repo" push -q origin "HEAD:$GITHUB_BRANCH"
  log WARN "rollback completed removed=$(basename "$latest")"
}

[[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE; copy .env.example to .env and configure it"
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${BACKUP_ROOT:=$SCRIPT_DIR/backups}"
: "${BACKUP_STAGING_DIR:=${TMPDIR:-/tmp}/system-backup-staging}"
: "${GITHUB_REPO:=${GITHUB_REPO_NAME:-system-backups}}"
: "${GITHUB_VISIBILITY:=private}"
: "${GITHUB_BRANCH:=main}"
: "${BACKUP_RETENTION_DAYS:=0}"
: "${ENCRYPTION_METHOD:=age}"
: "${DRY_RUN:=0}"
[[ -n "$REQUESTED_DRY_RUN" ]] && DRY_RUN="$REQUESTED_DRY_RUN"

for cmd in bash tar sha256sum curl git gh find mktemp flock install date sleep setsid; do require_cmd "$cmd"; done
GH_TOKEN="$(gh auth token 2>/dev/null || true)"
[[ -n "$GH_TOKEN" ]] && GITHUB_TOKEN="$GH_TOKEN"
[[ -d "$BACKUP_ROOT" ]] || die "backup source does not exist: $BACKUP_ROOT"
[[ "$GITHUB_VISIBILITY" == private ]] || die "refusing non-private repository"
[[ -n "${GITHUB_OWNER:-}" && -n "${GITHUB_TOKEN:-}" ]] || die "GITHUB_OWNER and GITHUB_TOKEN are required"
[[ "$GITHUB_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die "invalid branch name"
[[ "$BACKUP_RETENTION_DAYS" =~ ^(0|[1-9][0-9]*)$ ]] || die "invalid BACKUP_RETENTION_DAYS"
validate_name "$GITHUB_OWNER"; validate_name "$GITHUB_REPO"

case "$ENCRYPTION_METHOD" in
  age) require_cmd age; [[ -n "${AGE_RECIPIENT:-}" ]] || die "AGE_RECIPIENT is required" ;;
  gpg) require_cmd gpg; [[ -n "${GPG_RECIPIENT:-}" ]] || die "GPG_RECIPIENT is required" ;;
  *) die "ENCRYPTION_METHOD must be age or gpg" ;;
esac

mkdir -p -- "$BACKUP_STAGING_DIR" "$CONTROL_DIR"
chmod 700 "$CONTROL_DIR"

case "$ACTION" in
  status) control_status; exit 0 ;;
  start) control_start ;;
  pause) control_signal STOP pause; exit 0 ;;
  continue|resume) control_signal CONT continue; exit 0 ;;
  stop) control_signal TERM stop; exit 0 ;;
  abort) control_abort; exit 0 ;;
  restart) control_restart ;;
  rollback) control_rollback; exit 0 ;;
  run) : ;;
  *) die "usage: $0 [start|status|pause|continue|resume|stop|abort|restart|rollback]" ;;
esac

exec 9>"$LOCK_FILE"
flock -n 9 || die "another backup is already running (lock: $LOCK_FILE)"
printf '%s\n' "$$" > "$PID_FILE"
EXECUTION_STARTED=1
write_state running
trap 'log WARN "interrupted"; exit 130' INT TERM
trap 'audit_debug "$BASH_COMMAND"' DEBUG

if [[ "$DRY_RUN" == 1 ]]; then
  log INFO "dry-run source=$BACKUP_ROOT target=$GITHUB_OWNER/$GITHUB_REPO"
  exit 0
fi

stage="$(mktemp -d "$BACKUP_STAGING_DIR/run.XXXXXX")"
chmod 700 "$stage"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$stage/system-backup-$stamp.tar.gz"
encrypted="$archive.age"
log INFO "creating archive source=$BACKUP_ROOT"
tar --exclude='./.git' --exclude='*.tmp' --exclude='*.part' -czf "$archive" -C "$BACKUP_ROOT" .
[[ -s "$archive" ]] || die "archive is empty"

case "$ENCRYPTION_METHOD" in
  age) age -r "$AGE_RECIPIENT" -o "$encrypted" "$archive" ;;
  gpg) gpg --batch --yes --trust-model always --recipient "$GPG_RECIPIENT" --output "$encrypted" --encrypt "$archive" ;;
esac
rm -f -- "$archive"
[[ -s "$encrypted" ]] || die "encryption produced no output"
sha256sum "$encrypted" > "$encrypted.sha256"

api="https://api.github.com"
auth=(-H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')
repo_url="$api/repos/$GITHUB_OWNER/$GITHUB_REPO"
status="$(curl --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 60 -sS -o "$stage/repo.json" -w '%{http_code}' "${auth[@]}" "$repo_url")"
if [[ "$status" == 404 ]]; then
  log INFO "creating private repository target=$GITHUB_OWNER/$GITHUB_REPO"
  retry create-repository curl --fail-with-body --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 60 -sS -X POST "${auth[@]}" -H 'Content-Type: application/json' -d "{\"name\":\"$GITHUB_REPO\",\"private\":true,\"description\":\"Encrypted system backups\",\"auto_init\":true}" "$api/user/repos" >/dev/null
elif [[ "$status" != 200 ]]; then
  die "GitHub repository lookup failed with HTTP $status"
fi

repo_dir="$stage/repo"
gh auth setup-git >/dev/null
ASKPASS_FILE="$stage/git-askpass.sh"
printf '%s\n' '#!/usr/bin/env bash' 'case "$1" in *Username*) printf "%s" "x-access-token" ;; *) printf "%s" "$GITHUB_TOKEN" ;; esac' > "$ASKPASS_FILE"
chmod 700 "$ASKPASS_FILE"
export GIT_ASKPASS="$ASKPASS_FILE" GIT_TERMINAL_PROMPT=0
retry clone-repository gh repo clone "$GITHUB_OWNER/$GITHUB_REPO" "$repo_dir"
install -m 600 "$encrypted" "$repo_dir/"
install -m 600 "$encrypted.sha256" "$repo_dir/"
printf '%s\n' "Encrypted backup generated at $stamp UTC" > "$repo_dir/README.backup.txt"

if [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  find "$repo_dir" -maxdepth 1 -type f -name 'system-backup-*.tar.gz.age' -mtime "+$BACKUP_RETENTION_DAYS" -delete
  find "$repo_dir" -maxdepth 1 -type f -name 'system-backup-*.tar.gz.age.sha256' -mtime "+$BACKUP_RETENTION_DAYS" -delete
fi
git -C "$repo_dir" add --all
if git -C "$repo_dir" diff --cached --quiet; then
  log INFO "no changes to push"
else
  git -C "$repo_dir" -c user.name="system-backup" -c user.email="system-backup@localhost" commit -q -m "backup: $stamp"
  retry push-backup git -C "$repo_dir" push -q origin "HEAD:$GITHUB_BRANCH"
  log INFO "encrypted backup pushed target=https://github.com/$GITHUB_OWNER/$GITHUB_REPO"
fi
