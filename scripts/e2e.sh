#!/usr/bin/env bash
# Opt-in headless-browser check of the Configure page (needs Playwright; not a project dependency).
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { echo "Usage: $(basename "$0") [--flow] [--visual]  - loads the Configure page headless, waits for #ab_config, fails on console errors. Needs SPLUNK_USER/SPLUNK_PASSWORD and: npm i --no-save playwright && npx playwright install chromium"; exit 0; }
splunk_env
require_env SPLUNK_USER SPLUNK_PASSWORD
[[ -d "$ROOT_DIR/node_modules/playwright" ]] || die "$EX_CONFIG" "Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium"
cd "$ROOT_DIR" && SPLUNK_WEB_URL="$SPLUNK_WEB_URL" node tests/e2e/configure.mjs
# --flow also drives the add/delete field UI against the real config (it cleans up after itself)
for arg in "$@"; do
  case "$arg" in
    --flow) SPLUNK_WEB_URL="$SPLUNK_WEB_URL" node tests/e2e/flow.mjs ;;
    # --visual sweeps every tab and overlay at three widths for cut off tooltips, spilled text and overlapping controls
    --visual) SPLUNK_WEB_URL="$SPLUNK_WEB_URL" node tests/e2e/visual.mjs ;;
  esac
done
