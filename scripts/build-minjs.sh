#!/usr/bin/env bash
# Build appserver/static/js/src/*.js into minified *.min.js (Babel, then terser).
#
# Builds into a temp directory and only replaces the outputs when every file built, so a
# failure never leaves the tree half-built. Stray non-min files next to the outputs are ignored.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { echo "Usage: $(basename "$0") [--out DIR]  - build js/src into DIR (default appserver/static/js)"; }

out="$ROOT_DIR/appserver/static/js"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --out) [[ $# -ge 2 ]] || { usage >&2; exit "$EX_USAGE"; }; out="$2"; shift 2 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
done

bin="$ROOT_DIR/node_modules/.bin"
[[ -x "$bin/babel" && -x "$bin/terser" ]] || die "$EX_CONFIG" "node_modules missing; run 'npm ci' first."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/es5" "$work/min"

(cd "$ROOT_DIR" && "$bin/babel" appserver/static/js/src -d "$work/es5") >"$work/babel.log" 2>&1 \
  || { cat "$work/babel.log" >&2; die "$EX_FAIL" "babel failed; nothing was written."; }

count=0
for f in "$work"/es5/*.js; do
  name=$(basename "$f" .js)
  "$bin/terser" "$f" --compress --mangle --output "$work/min/$name.min.js" \
    || die "$EX_FAIL" "terser failed on $name.js; nothing was written."
  count=$((count + 1))
done
((count > 0)) || die "$EX_FAIL" "no source files found in appserver/static/js/src."

mkdir -p "$out"
find "$out" -maxdepth 1 -name '*.min.js' -exec rm -f {} +
cp "$work"/min/*.min.js "$out"/
ok "built $count file(s) into ${out#"$ROOT_DIR"/}"
