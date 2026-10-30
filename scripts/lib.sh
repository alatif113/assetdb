#!/usr/bin/env bash
# Shared helpers for AssetDB scripts. Source this file; do not execute it.
# Exit codes used across scripts: 0 ok, 1 failure, 2 usage, 3 config/env, 4 connectivity.

# shellcheck disable=SC2034
EX_FAIL=1 EX_USAGE=2 EX_CONFIG=3 EX_CONN=4

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  C_RED=$'\033[31m' C_GRN=$'\033[32m' C_YEL=$'\033[33m' C_BLU=$'\033[34m' C_OFF=$'\033[0m'
else
  C_RED='' C_GRN='' C_YEL='' C_BLU='' C_OFF=''
fi

info() { printf '%s[info]%s %s\n' "$C_BLU" "$C_OFF" "$*" >&2; }
ok()   { printf '%s[ ok ]%s %s\n' "$C_GRN" "$C_OFF" "$*" >&2; }
warn() { printf '%s[warn]%s %s\n' "$C_YEL" "$C_OFF" "$*" >&2; }
err()  { printf '%s[fail]%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; }
die()  { local code="$1"; shift; err "$*"; exit "$code"; }

# Load .env.local without overriding variables already set in the environment.
load_env() {
  local f="${ENV_FILE:-$ROOT_DIR/.env.local}" line key val
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    [[ -z "${!key:-}" ]] && export "$key=$val"
  done < "$f"
  return 0
}

# require_env VAR... : fail fast naming every missing variable (never prints values).
require_env() {
  local missing=() v
  for v in "$@"; do [[ -n "${!v:-}" ]] || missing+=("$v"); done
  if ((${#missing[@]})); then
    die "$EX_CONFIG" "Missing required variable(s): ${missing[*]}. Set them in the environment or .env.local (see .env.example)."
  fi
}

# Load env and validate the Splunk connection settings. Sets SPLUNK_MGMT_URL / SPLUNK_WEB_URL.
splunk_env() {
  load_env
  require_env SPLUNK_HOST
  SPLUNK_MGMT_PORT="${SPLUNK_MGMT_PORT:-8089}"
  SPLUNK_WEB_PORT="${SPLUNK_WEB_PORT:-8000}"
  if [[ -z "${SPLUNK_TOKEN:-}" && ( -z "${SPLUNK_USER:-}" || -z "${SPLUNK_PASSWORD:-}" ) ]]; then
    die "$EX_CONFIG" "Set SPLUNK_TOKEN, or both SPLUNK_USER and SPLUNK_PASSWORD."
  fi
  guard_host
  SPLUNK_MGMT_URL="https://$SPLUNK_HOST:$SPLUNK_MGMT_PORT"
  SPLUNK_WEB_URL="https://$SPLUNK_HOST:$SPLUNK_WEB_PORT"
  if [[ "${SPLUNK_INSECURE_TLS:-0}" == "1" ]]; then
    warn "SPLUNK_INSECURE_TLS=1: TLS certificate verification is DISABLED."
  fi
}

# Refuse to continue unless SPLUNK_HOST is in ALLOWED_HOSTS.
guard_host() {
  require_env ALLOWED_HOSTS
  local h
  IFS=',' read -r -a _hosts <<< "$ALLOWED_HOSTS"
  for h in "${_hosts[@]}"; do
    [[ "${h// /}" == "$SPLUNK_HOST" ]] && return 0
  done
  die "$EX_CONFIG" "SPLUNK_HOST '$SPLUNK_HOST' is not in ALLOWED_HOSTS ($ALLOWED_HOSTS); refusing to continue."
}

# splunk_curl [curl args...] URL : curl with auth/TLS applied. Credentials go via a
# process-substitution config so they never appear in the process list or logs.
splunk_curl() {
  local tls=()
  if [[ "${SPLUNK_INSECURE_TLS:-0}" == "1" ]]; then
    tls=(--insecure)
  elif [[ -n "${SPLUNK_CA_BUNDLE:-}" ]]; then
    tls=(--cacert "$SPLUNK_CA_BUNDLE")
  fi
  local cfg
  if [[ -n "${SPLUNK_TOKEN:-}" ]]; then
    cfg=$(printf 'header = "Authorization: Bearer %s"\n' "$SPLUNK_TOKEN")
  else
    cfg=$(printf 'user = "%s:%s"\n' "$SPLUNK_USER" "$SPLUNK_PASSWORD")
  fi
  curl --silent --show-error --max-time "${CURL_TIMEOUT:-30}" "${tls[@]}" --config <(printf '%s\n' "$cfg") "$@"
}

# splunk_get PATH [curl args] : GET a management endpoint as JSON.
splunk_get() {
  local path="$1"; shift
  splunk_curl --get --data-urlencode "output_mode=json" "$@" "$SPLUNK_MGMT_URL$path"
}

# splunk_post PATH [curl args] : POST to a management endpoint as JSON.
splunk_post() {
  local path="$1"; shift
  splunk_curl --data-urlencode "output_mode=json" "$@" "$SPLUNK_MGMT_URL$path"
}

# Verify TCP reachability of the management port, then authentication. Prints server facts.
check_connectivity() {
  if ! (exec 3<>"/dev/tcp/$SPLUNK_HOST/$SPLUNK_MGMT_PORT") 2>/dev/null; then
    die "$EX_CONN" "Cannot reach $SPLUNK_HOST:$SPLUNK_MGMT_PORT. Verify the management port (default 8089) and network."
  fi
  local out rc=0
  out=$(splunk_get /services/server/info) || rc=$?
  if ((rc)); then
    case $rc in
      60|35|51|58|59|77|83) die "$EX_CONN" "TLS error talking to $SPLUNK_MGMT_URL (curl $rc). Set SPLUNK_CA_BUNDLE, or opt in with SPLUNK_INSECURE_TLS=1." ;;
      *) die "$EX_CONN" "Request to $SPLUNK_MGMT_URL failed (curl exit $rc)." ;;
    esac
  fi
  if ! jq -e '.entry[0].content.version' <<< "$out" >/dev/null 2>&1; then
    die "$EX_CONN" "Authentication failed or unexpected response from /services/server/info (check token/credentials and permissions)."
  fi
  SPLUNK_VERSION=$(jq -r '.entry[0].content.version' <<< "$out")
  SPLUNK_SERVER_NAME=$(jq -r '.entry[0].content.serverName' <<< "$out")
  KV_STATUS=$(splunk_get /services/kvstore/status | jq -r '.entry[0].content.current.status // "unknown"')
  ok "Splunk $SPLUNK_VERSION on '$SPLUNK_SERVER_NAME' (KV store: $KV_STATUS)"
}

# App metadata from default/app.conf.
app_conf_get() { # section key
  awk -v s="[$1]" -v k="$2" '
    $0==s {in_s=1; next} /^\[/ {in_s=0}
    in_s { split($0,a,/[ \t]*=[ \t]*/); if (a[1]==k) { sub(/^[^=]*=[ \t]*/,""); print; exit } }
  ' "$ROOT_DIR/default/app.conf"
}
app_id()      { app_conf_get package id; }
app_version() { app_conf_get launcher version; }
