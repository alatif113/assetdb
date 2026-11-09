#!/usr/bin/env bash
# Verify the committed custom visualizations (appserver/static/visualizations for Dashboard Studio, appserver/static/classic for the
# classic dashboards) and the Explorer and Coverage dashboards (default/data/ui/views/assetdb_{explorer,coverage}.xml) match a fresh
# build of their sources. Builds into a temp directory.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { echo "Usage: $(basename "$0") [-h]  - fail if the built visualizations or the classic dashboards are stale relative to viz/ and scripts/build-dashboards.py"; }
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }
[[ $# -eq 0 ]] || { usage >&2; exit "$EX_USAGE"; }

[[ -d "$ROOT_DIR/node_modules/esbuild" ]] || die "$EX_CONFIG" "esbuild missing; run 'npm ci' first."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

(cd "$ROOT_DIR" && node viz/build.mjs --out "$tmp") >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; die "$EX_FAIL" "visualization build failed."; }

stale=0
while IFS= read -r built; do
  rel="${built#"$tmp"/}"
  if ! cmp -s "$built" "$ROOT_DIR/appserver/static/$rel"; then
    err "stale: appserver/static/$rel differs from a fresh build of viz/"
    stale=1
  fi
done < <(find "$tmp/visualizations" "$tmp/js/classic" -type f | sort)
while IFS= read -r committed; do
  [[ -f "$tmp/${committed#"$ROOT_DIR"/appserver/static/}" ]] || { err "orphan built file without source: ${committed#"$ROOT_DIR"/}"; stale=1; }
done < <(find "$ROOT_DIR/appserver/static/visualizations" "$ROOT_DIR/appserver/static/js/classic" -type f | sort)
((stale)) && die "$EX_FAIL" "visualizations out of date. Run 'npm run build:viz' and commit the result."
ok "committed visualizations match a fresh build"

python3 "$ROOT_DIR/scripts/build-vendor-icons.py" --check || die "$EX_FAIL" "Vendor icons out of date. Run 'python3 scripts/build-vendor-icons.py' and commit the result."
python3 "$ROOT_DIR/scripts/build-dashboards.py" --check || die "$EX_FAIL" "Classic dashboards out of date. Run 'python3 scripts/build-dashboards.py' and commit the result."
