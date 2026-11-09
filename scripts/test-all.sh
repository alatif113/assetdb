#!/usr/bin/env bash
# Run the whole pipeline in order, stop on first failure, print a pass/fail table with timings.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

STAGES=(unit minjs package inspect deploy reload integration)

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--skip-deploy] [--dry-run] [--only STAGE] [--yes]

Stages, in order: ${STAGES[*]}

  --skip-deploy   run only the local stages (unit, minjs, package, inspect)
  --dry-run       run deploy and reload with --dry-run and skip integration (safe look at the server)
  --only STAGE    run a single stage
  --yes           pass --yes to deploy/reload (no prompts)
  -h, --help      show this help
USAGE
}

SKIP_DEPLOY=0 DRY=0 ONLY="" YES=0
while (($#)); do
  case "$1" in
    --skip-deploy) SKIP_DEPLOY=1 ;;
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --only) ONLY="${2:?--only needs a stage}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit "$EX_USAGE" ;;
  esac
  shift
done
if [[ -n "$ONLY" ]]; then
  case " ${STAGES[*]} " in *" $ONLY "*) ;; *) die "$EX_USAGE" "Unknown stage '$ONLY' (valid: ${STAGES[*]})" ;; esac
fi

cd "$ROOT_DIR"
PY="$ROOT_DIR/.venv/bin/python"
[[ -x "$PY" ]] || { python3 -m venv .venv; .venv/bin/pip install -q -r requirements-dev.txt; }
[[ -d node_modules ]] || npm ci --no-audit --no-fund --silent

flags=()
((YES)) && flags+=(--yes)
((DRY)) && flags+=(--dry-run)

run_stage() {
  case "$1" in
    unit)        "$PY" -m pytest -q && npm test --silent && tests/shell/deploy-mock-test.sh && .venv/bin/shellcheck -x scripts/*.sh tests/shell/*.sh ;;
    minjs)       scripts/check-minjs.sh && scripts/check-viz.sh ;;
    package)     scripts/package.sh ;;
    inspect)     scripts/appinspect.sh ;;
    deploy)      scripts/deploy.sh ${flags[@]+"${flags[@]}"} ;;
    reload)      scripts/reload.sh ${flags[@]+"${flags[@]}"} ;;
    integration) "$PY" -m pytest tests/integration -c pytest.ini --rootdir . -o testpaths=tests/integration -p no:cacheprovider ;;
  esac
}

results=() failed=0
for st in "${STAGES[@]}"; do
  [[ -z "$ONLY" || "$ONLY" == "$st" ]] || continue
  skip=""
  if [[ -z "$ONLY" ]]; then
    case "$st" in
      deploy|reload|integration) ((SKIP_DEPLOY)) && skip="--skip-deploy" ;;
    esac
    [[ "$st" == integration && $DRY -eq 1 ]] && skip="--dry-run"
  fi
  if [[ -n "$skip" ]]; then results+=("$st|SKIP|0|$skip"); continue; fi
  info "=== stage: $st ==="
  start=$SECONDS
  if run_stage "$st"; then results+=("$st|PASS|$((SECONDS - start))|"); else results+=("$st|FAIL|$((SECONDS - start))|"); failed=1; break; fi
done

printf '\n%-14s %-6s %8s  %s\n' STAGE RESULT SECONDS NOTE >&2
for r in "${results[@]}"; do
  IFS='|' read -r st res secs note <<< "$r"
  color="$C_GRN"; [[ "$res" == FAIL ]] && color="$C_RED"; [[ "$res" == SKIP ]] && color="$C_YEL"
  printf '%-14s %s%-6s%s %8s  %s\n' "$st" "$color" "$res" "$C_OFF" "$secs" "$note" >&2
done
if ((failed)); then die "$EX_FAIL" "pipeline stopped on first failure"; fi
ok "pipeline finished"
