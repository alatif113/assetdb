#!/usr/bin/env bash
# Build the production package dist/<app-id>-<version>.tar.gz (allowlist: only what Splunk needs), suitable for
# AppInspect and `splunk install app`.
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

# What ships is an allowlist: only these paths (relative to the repo root) go into the package, so a new dev file
# can never leak into a release. Splunk needs nothing else: no tests, scripts, docs, sources, configs or lockfiles.
INCLUDES=(
  '/default/***' '/bin/***' '/lib/***' '/lookups/***'
  '/metadata/' '/metadata/default.meta'
  '/static/' '/static/*.png'                          # app icons and logo (AppInspect allows only png here)
  '/appserver/' '/appserver/static/' '/appserver/static/css/***'
  '/appserver/static/js/' '/appserver/static/js/*.min.js'   # built output; the sources in js/src stay out
  '/appserver/static/js/classic/***'                  # the same visualizations built for the classic dashboards
  '/appserver/static/visualizations/***'              # built custom visualizations (visualization.js + config.json); sources in viz/ stay out
  '/LICENSE' '/README.md' '/CHANGELOG.md'
)
# Never ship these, even inside an allowed path (checked before the allowlist).
EXCLUDES=(
  '.*' '*.pyc' '*.pyo' __pycache__ '*.swp' '*.swo' '*~' '*.bak' '*.orig' '*.log'
  '* [0-9]*'   # iCloud Drive conflict copies ("name 2.py", "name 12.js")
  local local.meta
)

build_assets() {
  command -v npm >/dev/null || die "$EX_CONFIG" "npm not found"
  info "npm ci"
  (cd "$ROOT_DIR" && npm ci --no-audit --no-fund --silent) || die "$EX_FAIL" "npm ci failed"
  info "npm run build"
  (cd "$ROOT_DIR" && npm run build --silent >/dev/null) || die "$EX_FAIL" "npm run build failed"
  info "npm run build:viz"
  (cd "$ROOT_DIR" && npm run build:viz --silent >/dev/null) || die "$EX_FAIL" "npm run build:viz failed"
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

  local rules=() p
  for p in "${EXCLUDES[@]}"; do rules+=(--exclude "$p"); done
  for p in "${INCLUDES[@]}"; do rules+=(--include "$p"); done
  rsync -a --prune-empty-dirs --no-perms --no-owner --no-group "${rules[@]}" --exclude '*' "$ROOT_DIR/" "$stage/$id/"

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
  bad=$(tar -tzf "$f" | grep -E '(^|/)(\.[^/]+|__pycache__|node_modules|local)(/|$)|\.pyc$|/\._|/[^/]* [0-9]+(\.[^/]*)?$|/(tests|scripts|docs|dist)(/|$)' || true)
  [[ -z "$bad" ]] || die "$EX_FAIL" "Forbidden entries in archive:"$'\n'"$bad"
  local extra
  extra=$(tar -tzf "$f" | sed "s|^$id/||" | awk -F/ 'NF && $1 != "" {print $1}' | sort -u | grep -vxE 'default|bin|lib|lookups|metadata|static|appserver|LICENSE|README.md|CHANGELOG.md' || true)
  [[ -z "$extra" ]] || die "$EX_FAIL" "Unexpected top-level entries in archive: $extra"
  bad=$(tar -tzf "$f" | grep -E "^$id/(static/[^/]+|appserver/static/js/[^/]+)$" | grep -vE "\.png$|\.min\.js$" || true)
  [[ -z "$bad" ]] || die "$EX_FAIL" "Only png files may be in static/ and only *.min.js in appserver/static/js: $bad"
  tar -tzf "$f" | grep -q "^$id/appserver/static/js/src" && die "$EX_FAIL" "JavaScript sources must not ship"
  tar -tzf "$f" | grep -qE "^$id/(viz|node_modules)(/|$)" && die "$EX_FAIL" "Visualization sources must not ship (only the built files in appserver/static/visualizations)"
  bad=$(tar -tzf "$f" | grep -E "^$id/appserver/static/visualizations/[^/]+/[^/]+$" | grep -vE "/(visualization\.js|config\.json)$" || true)
  [[ -z "$bad" ]] || die "$EX_FAIL" "Only visualization.js and config.json may be in a visualization folder: $bad"
  bad=$(tar -tzf "$f" | grep -E "^$id/appserver/static/js/classic/[^/]+$" | grep -vE "\.min\.js$" || true)
  [[ -z "$bad" ]] || die "$EX_FAIL" "Only .min.js files may be in appserver/static/js/classic: $bad"
  for viz in $(grep -E '^\[' "$ROOT_DIR/default/visualizations.conf" | tr -d '[]'); do
    tar -tzf "$f" | grep -qx "$id/appserver/static/js/classic/$viz.min.js" || die "$EX_FAIL" "Visualization $viz has no classic build in the archive"
  done
  for viz in $(grep -E '^\[' "$ROOT_DIR/default/visualizations.conf" | tr -d '[]'); do
    tar -tzf "$f" | grep -qx "$id/appserver/static/visualizations/$viz/visualization.js" || die "$EX_FAIL" "Visualization $viz is in visualizations.conf but its built visualization.js is not in the archive"
  done
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
