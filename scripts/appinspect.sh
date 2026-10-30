#!/usr/bin/env bash
# Run splunk-appinspect against the packaged tarball and summarize the JSON report.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--strict] [--api] [--package FILE]

Runs splunk-appinspect (from .venv, installed from requirements-dev.txt) on the packaged
tarball (default: dist/<id>-<version>.tar.gz) and writes reports to dist/appinspect/.

  --strict        treat warnings as failures too
  --api           ALSO submit to the Splunk AppInspect API (needs SPLUNK_COM_USER and
                  SPLUNK_COM_PASSWORD, i.e. splunk.com credentials). Off by default.
  --package FILE  inspect this tarball instead of the default
  -h, --help      show this help

Environment:
  APPINSPECT_TAGS   comma/space separated --included-tags (default: cloud; empty = all checks)

Waivers: failures/errors whose check name appears in .appinspect-waivers
("<check_name> | <justification>") are reported as WAIVED and do not fail the run.
Every waiver must also be explained in docs/TESTING.md.
USAGE
}

STRICT=0 API=0 PKG=""
while (($#)); do
  case "$1" in
    --strict) STRICT=1 ;;
    --api) API=1 ;;
    --package) PKG="${2:?--package needs a file}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
  shift
done

load_env
TAGS="${APPINSPECT_TAGS-cloud}"
PKG="${PKG:-$DIST_DIR/$(app_id)-$(app_version).tar.gz}"
[[ -f "$PKG" ]] || die "$EX_CONFIG" "Package not found: $PKG (run scripts/package.sh first)"
command -v jq >/dev/null || die "$EX_CONFIG" "jq is required"

VENV="$ROOT_DIR/.venv"
if [[ ! -x "$VENV/bin/splunk-appinspect" ]]; then
  info "Installing splunk-appinspect into .venv"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$ROOT_DIR/requirements-dev.txt"
fi

OUT="$DIST_DIR/appinspect"
mkdir -p "$OUT"
JSON="$OUT/report.json" TXT="$OUT/report.txt"

tag_args=()
if [[ -n "$TAGS" ]]; then
  IFS=', ' read -r -a _tags <<< "$TAGS"
  for t in "${_tags[@]}"; do [[ -n "$t" ]] && tag_args+=(--included-tags "$t"); done
fi

info "AppInspect on $(basename "$PKG") tags='${TAGS:-<all>}'"
# Human-readable report on stdout (saved to report.txt); JSON via --output-file. Non-zero
# exit from appinspect itself is evaluated below from the JSON, not here.
"$VENV/bin/splunk-appinspect" inspect "$PKG" "${tag_args[@]}" --max-messages all \
  --output-file "$JSON" --data-format json >"$TXT" 2>&1 || true
[[ -s "$JSON" ]] || { cat "$TXT" >&2; die "$EX_FAIL" "AppInspect produced no JSON report"; }

waived_checks() { # lines "name<TAB>justification"
  local f="$ROOT_DIR/.appinspect-waivers"
  [[ -f "$f" ]] || return 0
  grep -vE '^\s*(#|$)' "$f" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$1); j=$2; sub(/^[ \t]+/,"",j); print $1 "\t" j}'
}
WAIVERS=$(waived_checks | jq -R -s 'split("\n") | map(select(length>0) | split("\t") | {(.[0]): .[1]}) | add // {}')

# Per-check rows: name, result (after waivers), description, and file:line messages.
ROWS=$(jq --argjson w "$WAIVERS" '
  [.reports[].groups[].checks[]
   | . as $c
   | {name, description,
      result: (if ($c.result=="failure" or $c.result=="error") and ($w[$c.name] != null) then "waived" else $c.result end),
      waiver: $w[$c.name],
      messages: [.messages[] | select(.result=="failure" or .result=="error" or .result=="warning" or .result=="manual_check")
                 | {result, message, where: ((.message_filename // "") + (if .message_line != null then ":" + (.message_line|tostring) else "" end))}]}]' "$JSON")

count() { jq -r --arg r "$1" '[.[]|select(.result==$r)]|length' <<< "$ROWS"; }
n_fail=$(count failure); n_err=$(count error); n_warn=$(count warning)
n_na=$(count not_applicable); n_man=$(count manual_check); n_waived=$(count waived)

printf '\nAppInspect summary (%s)\n' "$(basename "$PKG")"
printf '  failure: %s  error: %s  warning: %s  manual_check: %s  not_applicable: %s  waived: %s\n\n' \
  "$n_fail" "$n_err" "$n_warn" "$n_man" "$n_na" "$n_waived"

jq -r '.[] | select(.result=="failure" or .result=="error" or .result=="warning" or .result=="manual_check" or .result=="waived")
  | "[\(.result|ascii_upcase)] \(.name)\n    \(.description|gsub("\n";" "))"
    + (if .waiver then "\n    WAIVER: \(.waiver)" else "" end)
    + ([.messages[] | "\n      - \(.where): \(.message|gsub("\n";" "))"] | join(""))' <<< "$ROWS" >&2

echo "Reports: $TXT  $JSON" >&2

if ((API)); then
  require_env SPLUNK_COM_USER SPLUNK_COM_PASSWORD
  info "Submitting to AppInspect API"
  token=$(curl -sS -u "$SPLUNK_COM_USER:$SPLUNK_COM_PASSWORD" https://api.splunk.com/2.0/rest/login/splunk | jq -r '.data.token // empty')
  [[ -n "$token" ]] || die "$EX_CONN" "AppInspect API login failed"
  req=$(curl -sS -H "Authorization: bearer $token" -F "app_package=@$PKG" ${TAGS:+-F "included_tags=${TAGS// /,}"} https://appinspect.splunk.com/v1/app/validate | jq -r '.request_id // empty')
  [[ -n "$req" ]] || die "$EX_CONN" "AppInspect API submission failed"
  for _ in $(seq 1 60); do
    st=$(curl -sS -H "Authorization: bearer $token" "https://appinspect.splunk.com/v1/app/validate/status/$req" | jq -r '.status')
    [[ "$st" == SUCCESS || "$st" == FAILURE ]] && break
    sleep 10
  done
  curl -sS -H "Authorization: bearer $token" -H "Content-Type: application/json" "https://appinspect.splunk.com/v1/app/report/$req" > "$OUT/api-report.json"
  ok "API report: $OUT/api-report.json (status ${st:-unknown})"
fi

if ((n_fail + n_err > 0)); then die "$EX_FAIL" "AppInspect: $((n_fail + n_err)) failure/error check(s)"; fi
if ((STRICT && n_warn > 0)); then die "$EX_FAIL" "AppInspect (--strict): $n_warn warning check(s)"; fi
ok "AppInspect passed (${n_warn} warning(s), ${n_waived} waived)"
