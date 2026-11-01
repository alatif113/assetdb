#!/usr/bin/env bash
# Verify the committed appserver/static/js/*.min.js match a fresh build of js/src.
# Builds into a temp directory so the working tree is never touched.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { echo "Usage: $(basename "$0") [-h]  - fail if committed *.min.js are stale relative to js/src"; }
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }
[[ $# -eq 0 ]] || { usage >&2; exit "$EX_USAGE"; }

[[ -d "$ROOT_DIR/node_modules/.bin" ]] || die "$EX_CONFIG" "node_modules missing; run 'npm ci' first."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

"$ROOT_DIR/scripts/build-minjs.sh" --out "$tmp" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; die "$EX_FAIL" "build failed."; }

stale=0
shopt -s nullglob
for built in "$tmp"/*.min.js; do
  name=$(basename "$built")
  if ! cmp -s "$built" "$ROOT_DIR/appserver/static/js/$name"; then
    err "stale: appserver/static/js/$name differs from a fresh build of src/"
    stale=1
  fi
done
for committed in "$ROOT_DIR"/appserver/static/js/*.min.js; do
  [[ -f "$tmp/$(basename "$committed")" ]] || { err "orphan min file without source: $(basename "$committed")"; stale=1; }
done

if ((stale)); then die "$EX_FAIL" "min.js out of date. Run 'npm run build' and commit the result."; fi
ok "committed *.min.js match a fresh build"
