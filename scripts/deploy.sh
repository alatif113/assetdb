#!/usr/bin/env bash
# Deploy the packaged app to the dev Splunk server over SSH, with backup and rollback.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [deploy|rollback] [--dry-run] [--yes] [--package FILE] [--purge-local]

  deploy (default)  install dist/<id>-<version>.tar.gz into \$SPLUNK_HOME_REMOTE/etc/apps/<id>
  rollback          restore the most recent backup from dist/backups/

  --dry-run         show what would change (rsync itemized diff); writes nothing anywhere
  --yes             skip the confirmation prompt
  --package FILE    deploy this tarball instead of the default
  --purge-local     DESTRUCTIVE: also delete the server's <app>/local and metadata/local.meta
                    (the app's saved configuration). KV store data is never deleted.
  -h, --help        show this help

Needs (env or .env.local): SPLUNK_HOST, ALLOWED_HOSTS, SSH_TARGET (user@host), SPLUNK_HOME_REMOTE,
and Splunk REST credentials (SPLUNK_TOKEN or SPLUNK_USER/SPLUNK_PASSWORD) for the pre-flight check.
By default the server's local/ and metadata/local.meta are preserved.
USAGE
}

CMD=deploy DRY=0 YES=0 PURGE=0 PKG="" tmp=""
while (($#)); do
  case "$1" in
    deploy|rollback) CMD="$1" ;;
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --purge-local) PURGE=1 ;;
    --package) PKG="${2:?--package needs a file}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
  shift
done

splunk_env
require_env SSH_TARGET SPLUNK_HOME_REMOTE

# The SSH host must also be on the allowlist (guards against a wrong SSH_TARGET).
SSH_HOST="${SSH_TARGET#*@}"
IFS=',' read -r -a _allowed <<< "$ALLOWED_HOSTS"
_ok=0; for h in "${_allowed[@]}"; do [[ "${h// /}" == "$SSH_HOST" ]] && _ok=1; done
((_ok)) || die "$EX_CONFIG" "SSH host '$SSH_HOST' is not in ALLOWED_HOSTS ($ALLOWED_HOSTS)"

ID=$(app_id); VERSION=$(app_version)
REMOTE_APP="$SPLUNK_HOME_REMOTE/etc/apps/$ID"
BACKUP_DIR="$DIST_DIR/backups"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10)

remote() { "${SSH[@]}" "$SSH_TARGET" "$@"; }

confirm() { # message
  ((YES)) && return 0
  [[ -t 0 ]] || die "$EX_USAGE" "Not a terminal: pass --yes to proceed non-interactively."
  local reply; read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "$EX_FAIL" "Aborted."
}

preflight() {
  check_connectivity
  remote "test -d '$SPLUNK_HOME_REMOTE/etc/apps'" 2>/dev/null \
    || die "$EX_CONN" "SSH to $SSH_TARGET failed or $SPLUNK_HOME_REMOTE/etc/apps is missing (check SSH_TARGET / SPLUNK_HOME_REMOTE)."
  command -v rsync >/dev/null || die "$EX_CONFIG" "local rsync is required"
  remote "command -v rsync >/dev/null" || die "$EX_CONFIG" "rsync is not installed on $SSH_HOST (required by this script)"
  INSTALLED=$(remote "grep -m1 -E '^version[[:space:]]*=' '$REMOTE_APP/default/app.conf' 2>/dev/null | sed 's/^[^=]*=[[:space:]]*//'" || true)
  if [[ -n "$INSTALLED" ]]; then info "Installed on server: $ID $INSTALLED"; else info "$ID is not installed on the server yet"; fi
}

rsync_args() { # protected paths survive --delete unless --purge-local
  local a=(-a --no-owner --no-group --delete --itemize-changes -e "ssh -o BatchMode=yes -o ConnectTimeout=10")
  if ((! PURGE)); then a+=(--exclude=/local/ --exclude=/metadata/local.meta); fi
  printf '%s\n' "${a[@]}"
}

# sync SRC_DIR : rsync SRC_DIR/ -> remote app dir; honours DRY.
sync_to_remote() {
  local src="$1" a=() line
  while IFS= read -r line; do a+=("$line"); done < <(rsync_args)
  ((DRY)) && a+=(--dry-run)
  remote "mkdir -p '$REMOTE_APP'"
  rsync "${a[@]}" "$src/" "$SSH_TARGET:$REMOTE_APP/"
}

describe_purge() {
  ((PURGE)) || return 0
  warn "--purge-local will DELETE on $SSH_HOST:"
  remote "ls -lR '$REMOTE_APP/local' '$REMOTE_APP/metadata/local.meta' 2>&1 | head -40" >&2 || true
}

take_backup() {
  local ts out; ts=$(date -u +%Y%m%dT%H%M%SZ)
  if [[ -n "${INSTALLED:-}" ]]; then
    out="$BACKUP_DIR/$ID-$ts-v${INSTALLED}.tar.gz"
    if ((DRY)); then info "[dry-run] would back up $REMOTE_APP (v$INSTALLED) to $out"; return; fi
    mkdir -p "$BACKUP_DIR"
    remote "tar -czf - -C '$SPLUNK_HOME_REMOTE/etc/apps' '$ID'" > "$out"
    if [[ ! -s "$out" ]] || ! tar -tzf "$out" >/dev/null; then die "$EX_FAIL" "Backup verification failed: $out"; fi
    ok "Backup: $out"
  else
    out="$BACKUP_DIR/$ID-$ts-none.marker"
    ((DRY)) && { info "[dry-run] nothing installed; would record $out"; return; }
    mkdir -p "$BACKUP_DIR"; : > "$out"; info "No prior install; recorded $out"
  fi
}

write_manifest() { # dir : sha256 of every shipped file
  local m="$DIST_DIR/last-deploy.manifest"
  [[ -f "$m" ]] && cp "$m" "$m.prev"
  (cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256) > "$m"
}

do_deploy() {
  PKG="${PKG:-$DIST_DIR/$ID-$VERSION.tar.gz}"
  [[ -f "$PKG" ]] || die "$EX_CONFIG" "Package not found: $PKG (run scripts/package.sh)"
  preflight
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$PKG" -C "$tmp"
  [[ -d "$tmp/$ID" ]] || die "$EX_FAIL" "Package has no top-level '$ID' directory"

  info "Plan: $ID ${INSTALLED:-<none>} -> $VERSION on $SSH_HOST:$REMOTE_APP  (preserving server local/: $((PURGE ? 0 : 1)))"
  describe_purge
  info "Changes on server (rsync itemized diff):"
  local saved_dry=$DRY; DRY=1; sync_to_remote "$tmp/$ID" | grep -v '^$' | sed 's/^/    /' >&2 || true; DRY=$saved_dry
  if ((DRY)); then take_backup; ok "Dry run complete; nothing was changed."; return; fi

  confirm "Deploy $ID $VERSION to $SPLUNK_HOST?"
  take_backup
  sync_to_remote "$tmp/$ID" >/dev/null
  write_manifest "$tmp/$ID"
  local now; now=$(remote "grep -m1 -E '^version[[:space:]]*=' '$REMOTE_APP/default/app.conf' | sed 's/^[^=]*=[[:space:]]*//'")
  [[ "$now" == "$VERSION" ]] || die "$EX_FAIL" "Post-deploy version on server is '$now', expected '$VERSION'"
  ok "Deployed $ID $VERSION. Run scripts/reload.sh to pick up changes."
}

do_rollback() {
  preflight
  local latest; latest=$(find "$BACKUP_DIR" -maxdepth 1 \( -name "$ID-*.tar.gz" -o -name "$ID-*.marker" \) 2>/dev/null | LC_ALL=C sort | tail -1 || true)
  [[ -n "$latest" ]] || die "$EX_CONFIG" "No backups in $BACKUP_DIR"
  if [[ "$latest" == *.marker ]]; then
    die "$EX_FAIL" "Most recent backup ($latest) records that the app was not installed before; rollback would mean removing it. Remove $REMOTE_APP manually if that is intended."
  fi
  info "Rolling back to $(basename "$latest")"
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$latest" -C "$tmp"
  [[ -d "$tmp/$ID" ]] || die "$EX_FAIL" "Backup has no '$ID' directory"
  describe_purge
  local saved_dry=$DRY; DRY=1; sync_to_remote "$tmp/$ID" | grep -v '^$' | sed 's/^/    /' >&2 || true; DRY=$saved_dry
  if ((DRY)); then ok "Dry run complete; nothing was changed."; return; fi
  confirm "Restore $(basename "$latest") on $SPLUNK_HOST?"
  sync_to_remote "$tmp/$ID" >/dev/null
  ok "Rolled back. Run scripts/reload.sh --restart to make sure Splunk picks it up."
}

case "$CMD" in
  deploy) do_deploy ;;
  rollback) do_rollback ;;
esac
