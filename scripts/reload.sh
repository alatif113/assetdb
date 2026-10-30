#!/usr/bin/env bash
# Pick the least disruptive way to activate a deployed change: nothing, reload, or restart.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--restart | --reload-only] [--dry-run] [--yes]

Compares dist/last-deploy.manifest with dist/last-deploy.manifest.prev (written by deploy.sh)
and decides:
  restart      bin/*, lib/*, commands/collections/transforms/app.conf changed (or first deploy)
  reload       other conf, macros, savedsearches, views, nav, metadata changed
  assets only  appserver/static changed: bump the web asset cache, hard-refresh the browser
  nothing      no differences

  --restart       force a full splunkd restart
  --reload-only   never restart; do the REST reloads only
  --dry-run       print the decision and actions, change nothing
  --yes           do not ask before restarting
  -h, --help      show this help

RESTART_TIMEOUT (seconds, default 300) bounds the wait for splunkd to come back.
USAGE
}

FORCE_RESTART=0 RELOAD_ONLY=0 DRY=0 YES=0
for a in "$@"; do
  case "$a" in
    --restart) FORCE_RESTART=1 ;;
    --reload-only) RELOAD_ONLY=1 ;;
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
done
((FORCE_RESTART && RELOAD_ONLY)) && die "$EX_USAGE" "--restart and --reload-only are mutually exclusive"

splunk_env
ID=$(app_id); VERSION=$(app_version)
TIMEOUT="${RESTART_TIMEOUT:-300}"
M="$DIST_DIR/last-deploy.manifest"

manifest_pairs() { # file -> sorted "path<TAB>hash"
  awk '{h=$1; $1=""; sub(/^ +/,""); sub(/^\.\//,""); print $0 "\t" h}' "$1" | LC_ALL=C sort
}

changed_files() { # prints changed/added/removed paths between prev and current manifest
  if [[ ! -f "$M" ]]; then return 1; fi
  if [[ ! -f "$M.prev" ]]; then return 2; fi
  diff <(manifest_pairs "$M.prev") <(manifest_pairs "$M") | grep -E '^[<>]' | cut -c3- | cut -f1 | LC_ALL=C sort -u || true
}

ACTION=nothing REASON="no differences"
decide() {
  local files rc=0
  files=$(changed_files) || rc=$?
  if ((rc == 1)); then ACTION=restart REASON="no deploy manifest (deploy.sh has not run from this checkout); assuming the worst"; return; fi
  if ((rc == 2)); then ACTION=restart REASON="first deploy recorded (no previous manifest)"; return; fi
  [[ -n "$files" ]] || return 0
  CHANGED="$files"
  local f
  while IFS= read -r f; do
    case "$f" in
      bin/*|lib/*|default/commands.conf|default/collections.conf|default/transforms.conf|default/app.conf)
        ACTION=restart REASON="$f changed"; return ;;
    esac
  done <<< "$files"
  ACTION=assets REASON="only static assets changed"
  while IFS= read -r f; do
    case "$f" in
      appserver/static/*|static/*) ;;
      *) ACTION=reload REASON="configuration/UI definition changed ($f)"; break ;;
    esac
  done <<< "$files"
}
CHANGED=""
decide
if ((FORCE_RESTART)); then ACTION=restart REASON="--restart"; fi
if ((RELOAD_ONLY)) && [[ "$ACTION" == restart ]]; then ACTION=reload REASON="--reload-only (would otherwise restart: $REASON)"; fi

info "Decision: $ACTION - $REASON"
if [[ -n "$CHANGED" ]]; then info "Changed files:"; while IFS= read -r f; do printf '    %s\n' "$f" >&2; done <<< "$CHANGED"; fi

rest_post() { # path -> prints status
  local code
  code=$(splunk_curl -o /dev/null -w '%{http_code}' -X POST "$SPLUNK_MGMT_URL$1") || code=000
  if [[ "$code" =~ ^2 ]]; then ok "POST $1 -> $code"; else warn "POST $1 -> $code"; fi
}

do_reload() {
  local p
  for p in "/services/apps/local/$ID/_reload" \
           "/servicesNS/nobody/$ID/data/ui/views/_reload" \
           "/servicesNS/nobody/$ID/data/ui/nav/_reload" \
           "/services/configs/conf-macros/_reload" \
           "/services/configs/conf-savedsearches/_reload" \
           "/services/configs/conf-assetdb/_reload"; do
    if ((DRY)); then info "[dry-run] POST $p"; else rest_post "$p"; fi
  done
}

# Web-tier cache bump (/en-US/_bump). It needs a Splunk Web session, which tokens cannot give,
# so this only works with SPLUNK_USER/SPLUNK_PASSWORD; otherwise print the manual step.
bump_assets() {
  local manual="Open $SPLUNK_WEB_URL/en-US/_bump in a logged-in browser and click 'Bump version', then hard-refresh the app (Cmd/Ctrl+Shift+R) - browsers cache *.min.js."
  if ((DRY)); then info "[dry-run] bump static asset cache at $SPLUNK_WEB_URL/en-US/_bump"; return; fi
  if [[ -z "${SPLUNK_USER:-}" || -z "${SPLUNK_PASSWORD:-}" ]]; then warn "No SPLUNK_USER/SPLUNK_PASSWORD for a web session. $manual"; return; fi
  local jar tls=() cval key
  jar=$(mktemp)
  if [[ "${SPLUNK_INSECURE_TLS:-0}" == "1" ]]; then tls=(--insecure); elif [[ -n "${SPLUNK_CA_BUNDLE:-}" ]]; then tls=(--cacert "$SPLUNK_CA_BUNDLE"); fi
  curl -sS -m 30 ${tls[@]+"${tls[@]}"} -c "$jar" -o /dev/null "$SPLUNK_WEB_URL/en-US/account/login" || { warn "web login page unreachable. $manual"; rm -f "$jar"; return; }
  cval=$(awk '$6=="cval"{print $7}' "$jar")
  curl -sS -m 30 ${tls[@]+"${tls[@]}"} -b "$jar" -c "$jar" -o /dev/null \
    --data-urlencode "username=$SPLUNK_USER" --data-urlencode "password=$SPLUNK_PASSWORD" \
    --data-urlencode "cval=$cval" --data-urlencode "set_has_logged_in=false" "$SPLUNK_WEB_URL/en-US/account/login" || true
  key=$(awk '/splunkweb_csrf_token/{print $7}' "$jar" | tail -1)
  if [[ -z "$key" ]]; then warn "web login failed. $manual"; rm -f "$jar"; return; fi
  local code
  code=$(curl -sS -m 30 ${tls[@]+"${tls[@]}"} -b "$jar" -H "X-Splunk-Form-Key: $key" -o /dev/null -w '%{http_code}' \
    --data-urlencode "splunk_form_key=$key" "$SPLUNK_WEB_URL/en-US/_bump") || code=000
  rm -f "$jar"
  if [[ "$code" =~ ^(2|3) ]]; then ok "Asset cache bumped ($code)"; else warn "_bump returned $code. $manual"; fi
  info "Browsers may still hold old JS/CSS: hard-refresh the page (Cmd/Ctrl+Shift+R)."
}

startup_time() { splunk_get /services/server/info 2>/dev/null | jq -r '.entry[0].content.startup_time // empty' 2>/dev/null || true; }

do_restart() {
  if ((DRY)); then info "[dry-run] POST /services/server/control/restart, then wait up to ${TIMEOUT}s for splunkd and the KV store"; return; fi
  if ((! YES)); then
    [[ -t 0 ]] || die "$EX_USAGE" "Restart requires --yes when not run from a terminal."
    local r; read -r -p "Restart splunkd on $SPLUNK_HOST? [y/N] " r
    [[ "$r" =~ ^[Yy]$ ]] || die "$EX_FAIL" "Aborted."
  fi
  local before; before=$(startup_time)
  rest_post /services/server/control/restart
  local deadline=$((SECONDS + TIMEOUT)) now
  info "Waiting for splunkd to restart (timeout ${TIMEOUT}s)"
  while ((SECONDS < deadline)); do
    sleep 5
    now=$(startup_time)
    if [[ -n "$now" && "$now" != "$before" ]]; then ok "splunkd is back (startup_time changed)"; return 0; fi
  done
  die "$EX_CONN" "splunkd did not come back within ${TIMEOUT}s"
}

verify() {
  ((DRY)) && return 0
  check_connectivity
  local deadline=$((SECONDS + 120))
  until [[ "$(splunk_get /services/kvstore/status | jq -r '.entry[0].content.current.status // ""')" == "ready" ]]; do
    ((SECONDS < deadline)) || die "$EX_CONN" "KV store not ready after 120s"
    sleep 5
  done
  ok "KV store ready"
  local app; app=$(splunk_get "/services/apps/local/$ID")
  local ver dis
  ver=$(jq -r '.entry[0].content.version // empty' <<< "$app"); dis=$(jq -r '.entry[0].content.disabled // empty' <<< "$app")
  [[ "$ver" == "$VERSION" ]] || die "$EX_FAIL" "App version on server is '$ver', expected '$VERSION'"
  [[ "$dis" == "0" || "$dis" == "false" ]] || die "$EX_FAIL" "App $ID is disabled on the server"
  ok "App $ID $ver is installed and enabled"
}

if ((! DRY)); then check_connectivity; fi
case "$ACTION" in
  nothing) info "Nothing to do." ;;
  assets)  bump_assets ;;
  reload)  do_reload; bump_assets ;;
  restart) do_restart ;;
esac
verify
