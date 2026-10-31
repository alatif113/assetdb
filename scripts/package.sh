#!/usr/bin/env bash
# Build dist/<app-id>-<version>.tar.gz suitable for AppInspect and `splunk install app`.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--skip-npm] [--repro-check]

Runs 'npm ci' and 'npm run build', stages the app into a single top-level directory
named after [package] id in default/app.conf, normalizes permissions/mtimes/ownership,
and writes dist/<id>-<version>.tar.gz (deterministic).

  --skip-npm      do not run npm ci / npm run build (use existing node_modules and min.js)
  --repro-check   build twice and fail if the two archives differ
  -h, --help      show this help
USAGE
}

SKIP_NPM=0 REPRO=0
for a in "$@"; do
  case "$a" in
    --skip-npm) SKIP_NPM=1 ;;
    --repro-check) REPRO=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
done

export COPYFILE_DISABLE=1   # macOS: no AppleDouble ._ files / xattr entries in the archive

# Paths (relative to the repo root) that never ship. Hidden files are excluded separately.
EXCLUDES=(
  '.*' node_modules node_modules.nosync tests scripts docs mockups dist local local.meta
  '*.pyc' __pycache__ '*.swp' '*~' '.DS_Store'
  CLAUDE.md package.json package-lock.json babel.config.json Makefile
  pytest.ini requirements-dev.txt coverage eslint.config.js pyproject.toml
  '* [0-9].*' '* [0-9]'   # iCloud Drive conflict copies ("name 2.py")
  appserver/static/js/src
  static/slides.gif   # README illustration only; AppInspect allows only png in static/
)

build_assets() {
  command -v npm >/dev/null || die "$EX_CONFIG" "npm not found"
  info "npm ci"
  (cd "$ROOT_DIR" && npm ci --no-audit --no-fund --silent) || die "$EX_FAIL" "npm ci failed"
  info "npm run build"
  (cd "$ROOT_DIR" && npm run build --silent >/dev/null) || die "$EX_FAIL" "npm run build failed"
}

epoch() {
  if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then echo "$SOURCE_DATE_EPOCH"
  elif git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1; then git -C "$ROOT_DIR" log -1 --format=%ct
  else echo 1577836800; fi
}

touch_tree() { # epoch dir : set every mtime under dir (and dir itself) to the epoch
  local e="$1" dir="$2" stamp
  stamp=$(TZ=UTC date -r "$e" +%Y%m%d%H%M.%S 2>/dev/null || TZ=UTC date -d "@$e" +%Y%m%d%H%M.%S)
  find "$dir" -exec env TZ=UTC touch -h -t "$stamp" {} +
}

make_archive() { # out_file
  local out="$1" id version stage e
  id=$(app_id); version=$(app_version)
  [[ -n "$id" && -n "$version" ]] || die "$EX_CONFIG" "Could not read [package] id / [launcher] version from default/app.conf"
  stage=$(mktemp -d)
  mkdir -p "$stage/$id"

  local ex=() p
  for p in "${EXCLUDES[@]}"; do ex+=(--exclude "$p"); done
  rsync -a --no-perms --no-owner --no-group "${ex[@]}" "$ROOT_DIR/" "$stage/$id/"

  find "$stage/$id" -type d -exec chmod 755 {} +
  find "$stage/$id" -type f -exec chmod 644 {} +
  command -v xattr >/dev/null && xattr -cr "$stage/$id" 2>/dev/null || true

  e=$(epoch)
  touch_tree "$e" "$stage/$id"

  local list="$stage/.list"
  (cd "$stage" && find "$id" -print | LC_ALL=C sort) > "$list"
  mkdir -p "$(dirname "$out")"
  if tar --version 2>/dev/null | grep -q 'GNU tar'; then
    (cd "$stage" && tar --no-recursion --owner=0 --group=0 --numeric-owner --mtime="@$e" -cf - -T "$list") | gzip -n -9 > "$out"
  else
    (cd "$stage" && tar --no-recursion --no-xattrs --uid 0 --gid 0 --uname root --gname root --numeric-owner -cf - -T "$list") | gzip -n -9 > "$out"
  fi
  rm -rf "$stage"
}

verify_archive() { # file
  local f="$1" id tops bad
  id=$(app_id)
  tops=$(tar -tzf "$f" | awk -F/ '{print $1}' | sort -u)
  [[ "$tops" == "$id" ]] || die "$EX_FAIL" "Archive must have exactly one top-level dir '$id'; found: $tops"
  tar -tzf "$f" | grep -qx "$id/default/app.conf" || die "$EX_FAIL" "default/app.conf missing from archive"
  bad=$(tar -tzf "$f" | grep -E '(^|/)(\.[^/]+|__pycache__|node_modules|local)(/|$)|\.pyc$|/\._' || true)
  [[ -z "$bad" ]] || die "$EX_FAIL" "Forbidden entries in archive:"$'\n'"$bad"
  local tmp; tmp=$(mktemp -d)
  tar -xzf "$f" -C "$tmp" "$id/default/app.conf"
  python3 - "$tmp/$id/default/app.conf" "$id" "$(app_version)" <<'PY' || die "$EX_FAIL" "app.conf invalid in archive"
import configparser, sys
p = configparser.ConfigParser(strict=False, interpolation=None)
p.read(sys.argv[1])
assert p["package"]["id"] == sys.argv[2], "package id mismatch"
assert p["launcher"]["version"] == sys.argv[3], "version mismatch"
assert p["id"]["version"] == p["launcher"]["version"], "[id] version must match [launcher] version"
assert p["id"]["name"] == sys.argv[2], "[id] name mismatch"
PY
  rm -rf "$tmp"
}

main() {
  ((SKIP_NPM)) || build_assets
  local id version out sum
  id=$(app_id); version=$(app_version)
  out="$DIST_DIR/$id-$version.tar.gz"
  make_archive "$out"
  verify_archive "$out"

  if ((REPRO)); then
    local second; second=$(mktemp)
    make_archive "$second"
    if ! cmp -s "$out" "$second"; then rm -f "$second"; die "$EX_FAIL" "Non-reproducible build: two consecutive archives differ"; fi
    rm -f "$second"; ok "reproducible: two builds are byte-identical"
  fi

  info "Contents:"; tar -tvzf "$out" | sed 's/^/    /' >&2
  sum=$(shasum -a 256 "$out" | awk '{print $1}')
  ok "$out ($(wc -c < "$out" | tr -d ' ') bytes) sha256=$sum"
}
main
