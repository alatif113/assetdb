#!/usr/bin/env bash
# Rebuild appserver/static/js/*.min.js from js/src in a temp copy and copy the results back.
# Safe to run when stray files (e.g. iCloud "name 2.js" duplicates) sit next to the outputs.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ -d "$ROOT_DIR/node_modules/.bin" ]] || die "$EX_CONFIG" "node_modules missing; run 'npm ci' first."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/appserver/static/js"
cp "$ROOT_DIR/package.json" "$ROOT_DIR/babel.config.json" "$tmp/"
cp -R "$ROOT_DIR/appserver/static/js/src" "$tmp/appserver/static/js/src"
ln -s "$ROOT_DIR/node_modules" "$tmp/node_modules"
(cd "$tmp" && npm run build --silent >"$tmp/build.log" 2>&1) || { cat "$tmp/build.log" >&2; die "$EX_FAIL" "npm run build failed."; }
cp "$tmp"/appserver/static/js/*.min.js "$ROOT_DIR/appserver/static/js/"
ok "rebuilt appserver/static/js/*.min.js"
