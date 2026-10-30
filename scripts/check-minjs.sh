#!/usr/bin/env bash
# Verify the committed appserver/static/js/*.min.js match a fresh build of js/src.
# Builds in a temp copy so the working tree is never touched.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { echo "Usage: $(basename "$0") [-h]  - fail if committed *.min.js are stale relative to js/src"; }
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }
[[ $# -eq 0 ]] || { usage >&2; exit "$EX_USAGE"; }

[[ -d "$ROOT_DIR/node_modules/.bin" ]] || die "$EX_CONFIG" "node_modules missing; run 'npm ci' first."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/appserver/static/js"
cp "$ROOT_DIR/package.json" "$ROOT_DIR/babel.config.json" "$tmp/"
cp -R "$ROOT_DIR/appserver/static/js/src" "$tmp/appserver/static/js/src"
ln -s "$ROOT_DIR/node_modules" "$tmp/node_modules"

(cd "$tmp" && npm run build --silent >"$tmp/build.log" 2>&1) || { cat "$tmp/build.log" >&2; die "$EX_FAIL" "npm run build failed in temp dir."; }

stale=0
shopt -s nullglob
for built in "$tmp"/appserver/static/js/*.min.js; do
  name=$(basename "$built")
  if ! cmp -s "$built" "$ROOT_DIR/appserver/static/js/$name"; then
    err "stale: appserver/static/js/$name differs from a fresh build of src/"
    stale=1
  fi
done
for committed in "$ROOT_DIR"/appserver/static/js/*.min.js; do
  [[ -f "$tmp/appserver/static/js/$(basename "$committed")" ]] || { err "orphan min file without source: $(basename "$committed")"; stale=1; }
done

if ((stale)); then die "$EX_FAIL" "min.js out of date. Run 'npm run build' and commit the result."; fi
ok "committed *.min.js match a fresh build"
