# Testing, packaging and deployment

Everything is driven by `make` (thin wrappers over `scripts/*.sh`). The target server is a
private **dev** Splunk instance (`splunk.home`); the scripts refuse any host not listed in
`ALLOWED_HOSTS`.

## Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Python | 3.9+ (developed on 3.13) | creates `.venv`; pins in `requirements-dev.txt` (pytest, requests, splunk-appinspect 4.4.0, shellcheck-py) |
| Node / npm | 22 (any recent LTS) | `npm ci` uses `package-lock.json` (babel, terser, underscore) |
| bash, rsync, ssh, jq, curl, tar, gzip | system | bash 3.2 (macOS) compatible |

One-time setup:

```sh
cp .env.example .env.local     # then edit; .env.local is gitignored
make venv && npm ci
```

## `.env.local` variables

| Variable | Purpose |
| --- | --- |
| `SPLUNK_HOST`, `SPLUNK_MGMT_PORT` (8089), `SPLUNK_WEB_PORT` (8000) | where the dev server is. Verify the management port; do not assume it. |
| `ALLOWED_HOSTS` | comma-separated allowlist; scripts exit 3 if `SPLUNK_HOST` (or the SSH host) is not in it |
| `SPLUNK_TOKEN` (preferred) or `SPLUNK_USER` + `SPLUNK_PASSWORD` | REST auth. Secrets are never printed or passed on a command line. Web-session steps (asset bump, dashboard test, e2e) need user/password because tokens cannot log in to Splunk Web. |
| `SPLUNK_CA_BUNDLE` | CA/self-signed cert PEM to trust |
| `SPLUNK_INSECURE_TLS=1` | explicit opt-in to skip verification; prints a warning every time. Default off. |
| `SSH_TARGET`, `SPLUNK_HOME_REMOTE` | `user@splunk.home` and `/opt/splunk`; the ssh user must own the Splunk install (no sudo is used) |
| `APPINSPECT_TAGS` | AppInspect `--included-tags` (default `cloud`; empty = all checks) |
| `SPLUNK_COM_USER` / `SPLUNK_COM_PASSWORD` | only for the optional `appinspect.sh --api` |

### Creating a Splunk API token
Splunk Web -> Settings -> Tokens -> *New Token* (enable token authentication under Tokens ->
*Token Settings* first if needed). Use a user that can read `/services/server/info`, manage
apps, and run searches; put the value in `SPLUNK_TOKEN`. Download the server's certificate
(`openssl s_client -connect splunk.home:8089 -showcerts`) into a PEM and point
`SPLUNK_CA_BUNDLE` at it.

## Make targets

| Target | What it does |
| --- | --- |
| `make test` | pytest (adbmerge), `node --test` (golden SPL, the macro generators, the visualization logic), min.js freshness, visualization and Explore dashboard freshness (`scripts/check-viz.sh`), deploy mock test, shellcheck |
| `make package` | `npm ci`, `npm run build`, writes `dist/assetdb-<version>.tar.gz` (single top-level `assetdb/`, deterministic). It is an **allowlist** (`INCLUDES` in `scripts/package.sh`): `default/`, `bin/`, `lib/`, `lookups/`, `metadata/default.meta`, `static/*.png`, `appserver/static/css`, `js/*.min.js` and `visualizations/` (the built `visualization.js` and `config.json` of each visualization), `README.md`, `LICENSE`, `CHANGELOG.md`; nothing else can ship. The archive check fails on unexpected top-level entries, non-png files in `static/`, JS sources, hidden files, conflict copies and dev directories |
| `make inspect` | AppInspect on the tarball -> `dist/appinspect/report.{txt,json}` |
| `make deploy` | pre-flight (REST + ssh), backup to `dist/backups/`, rsync to the server (see below) |
| `make reload` | decide nothing / reload / restart from what changed since the last deploy |
| `make integration` | live tests against the server |
| `make e2e` | opt-in Playwright check (`npm i --no-save playwright && npx playwright install chromium`; `npm ci`/`make package` removes it again). `scripts/e2e.sh --flow` also adds and deletes a test field through the UI against the real config and restores the saved search text afterwards. |
| `make all` | `scripts/test-all.sh`: unit -> minjs -> package -> inspect -> deploy -> reload -> integration |

`scripts/test-all.sh` flags: `--skip-deploy` (local stages only), `--only <stage>`, `--dry-run`
(deploy/reload in dry-run, no integration), `--yes`.
Exit codes everywhere: 0 ok, 1 failure, 2 usage, 3 config/env, 4 connectivity.

## Golden files (generated SPL)

`tests/fixtures/configs/*.json` are field configs; `tests/fixtures/golden/*.spl` the expected
SPL from `makeMergeSearch()`. After an intentional generator change:

```sh
UPDATE_GOLDEN=1 npm test && git diff tests/fixtures/golden
```
Review the diff; commit it with the code change. The tests load the unmodified
`appserver/static/js/src/assetdb.js` in a `vm` sandbox with stubbed jQuery/Splunk MVC
(`tests/js/load-generator.js`), so no production refactor was needed.

If `npm run build` output changes (e.g. toolchain bump), `scripts/check-minjs.sh` fails until
the rebuilt `*.min.js` are committed.

## Reading AppInspect output

`scripts/appinspect.sh` prints counts and, for every failure/error/warning/manual check, the
check name, description and `file:line`. Failures/errors exit 1; warnings only with `--strict`.
Intentional exceptions live in `.appinspect-waivers` and are listed below.

Fixed in the app: missing `[id]` stanza in `app.conf`.

**No failures are waived and the SDK warning is gone.** `commands.conf` sets `python.required = 3.13`
and the vendored `lib/splunklib` is splunk-sdk 3.0.1, which needs Python >= 3.13 (AppInspect's cloud
checks require both). Consequence: `adbmerge` needs a Splunk version that can run custom commands on
Python 3.13 (the dev server, 10.4.2, does). Splunk 10.0 documents `python.required` as not
configurable and runs commands on its bundled Python 3.9, where this SDK will not import, so 10.0 is
not supported by the command. The `tests/python/test_command_protocol.py` test runs the command
with the vendored SDK.

**Accepted warnings:**
- `check_kos_are_accessible`: ACLs use the `admin` role (on-prem). Add `sc_admin` if the app is ever
  published for Splunk Cloud.

Other accepted warnings: `check_for_splunk_js` (informational telemetry note),
`check_for_python_script_existence` (generic py2/3 notice), `check_collections_conf`
(informational), `check_kos_are_accessible` (`admin` role vs `sc_admin`; Cloud only),
`check_hostnames_and_ips` (synthetic IPs in the demo lookup `assetdb_demo_assets.csv`).

## Deployment, reload and rollback

`deploy.sh` (SSH only): checks `ALLOWED_HOSTS`, REST auth (prints Splunk version, server name,
KV store state), ssh and remote rsync; backs up the installed app to `dist/backups/`; rsyncs the
extracted package with `--delete` while **preserving the server's `local/` and
`metadata/local.meta`**; verifies the version afterwards; records `dist/last-deploy.manifest`.
Options: `--dry-run` (itemized diff, writes nothing), `--yes`, `--package FILE`,
`--purge-local` (destructive: also removes the server's `local/`, printing it first). KV store data
is never deleted.

```sh
scripts/deploy.sh --dry-run      # always first
scripts/deploy.sh                # asks for confirmation
scripts/deploy.sh rollback       # restore newest dist/backups/assetdb-*-v<old>.tar.gz
scripts/reload.sh --dry-run
```

`reload.sh` chooses: `bin/*`, `lib/*`, `commands/collections/transforms/app.conf` changed (or no
history) -> restart (`/services/server/control/restart`, polls until `startup_time` changes, then
KV store and app version); other conf/views/nav -> `_reload` endpoints; JS/CSS -> asset bump.
`--restart` and `--reload-only` override. After JS changes **hard-refresh the browser**
(Cmd/Ctrl+Shift+R); browsers cache `*.min.js`.

## Integration tests

They use a temporary KV collection/lookup `adbtest_<runid>` and temporary CSV lookups
(`adbtest_<runid>_*.csv`, created in the assetdb app context because the macros are not
exported) and delete them afterwards. The real `assetdb` collection and `assetdb.conf` are not
touched. If a run is killed, remove leftovers matching `adbtest_*` under Settings -> Lookups.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `TLS error ... (curl 60)` / `SSLError` | set `SPLUNK_CA_BUNDLE`, or knowingly `SPLUNK_INSECURE_TLS=1` |
| `Authentication failed` / 401 / 403 | token expired or wrong; user lacks `edit_*`/search capabilities; check `SPLUNK_MGMT_PORT` |
| `Cannot reach host:8089` | wrong port, firewall, or splunkd down |
| `refusing to continue ... ALLOWED_HOSTS` | host not allowlisted (by design) |
| `splunkd did not come back within 300s` | raise `RESTART_TIMEOUT`; check `splunkd.log` |
| `KV store not ready` | wait (it initialises after restart); `splunk show kvstore-status` on the server |
| Old UI after deploy | run `reload.sh`, hard-refresh; the integration test compares served `assetdb.min.js` with the repo build |
| `rsync is not installed on host` | install rsync on the server |

## Lint

`make lint` = shellcheck (`scripts/`, `tests/shell/`), ESLint (`eslint.config.js`; 0 errors required,
existing `==` / unused-variable warnings are tolerated up to a cap) and ruff (`pyproject.toml`).
`lib/`, `*.min*.js` and `dist/` are excluded.

## The Explorer and Coverage dashboards and their visualizations

`node tests/e2e/viz.mjs` (after `npm run build:viz` and `npm i --no-save playwright@1.64.0`) loads each built Dashboard Studio visualization in a headless browser with a mock of the Studio extension API, in light and dark. It checks the data contract (columns read, optional ones missing, empty results), selection and search events (nothing is sent while the query is still being typed), drilldown payloads, sorting, the legend brush, keyboard use and the provenance view. Screenshots go to `dist/viz/`. The mock feeds the shapes a real Splunk 10.4.2 produced when probed, so a change in the host would show up in the live check, not here.

`node tests/e2e/classic.mjs` does the same for the build the classic dashboards use (`appserver/static/js/classic/<name>.min.js`): the bundle runs in an iframe like the one `adb_frame.js` creates and is fed by `postMessage`, as on the dashboard.

`scripts/e2e.sh --explore` (`tests/e2e/explore-live.mjs`) opens the real Explorer and Coverage dashboards on a Splunk that has the app deployed, in both themes (`?theme=light|dark` on the URL, which changes nothing saved): the list and its count, selecting an asset (which fetches its provenance), searching (which re-runs the dashboard search), and a heatmap click that must open a search in a new window.

Every search in the dashboard can be run on its own: `python3 scripts/build-dashboards.py` writes them into the XML, and the macros they call are generated by `buildIconMacro` and `buildProvenanceMacro` in `generator.js` (tests in `tests/js/explorer-macros.test.js`).

## Static file caching after a deploy

Splunk Web serves app JS/CSS from a cache keyed by its static version, so a deployed change can keep
showing the old files. On a licensed instance use `/en-US/_bump` (what `scripts/reload.sh` tries); on
Splunk Free it is refused (403) and a splunkd restart (`scripts/reload.sh --restart --yes`) is what
reliably refreshes the files. Browsers also cache them for a year: hard-refresh after a deploy.

## What runs on Splunk

`make integration` (needs `.env.local`) runs the tests in `tests/integration`. Most behaviour of the generated search is checked by `test_semantics.py`: it builds temporary CSV source lookups and temporary KV collections (`adbtest_<tag>_<run>` with their own `_runs`, `_overflow` and `_changes`), runs the app's own generated search against them as a job (`search_job` fails on any eval/parser error, which the export endpoint would hide) and asserts the merged rows, run records, overflow list and change history. `test_normalizers.py` evaluates the `normalize_*` macros, `test_enrichment.py` the `adb_enrich*` macros, `test_templates.py` the source templates. The real `assetdb` collections are never written.

`scripts/e2e.sh --flow` drives the Configure page with a headless browser (Playwright, `npm i --no-save playwright && npx playwright install chromium`). The page renders inside a shadow root; Playwright's CSS selectors pierce it. The flow adds a test field (validation, draft-and-save, discard dialog), edits, disables, duplicates and removes it, runs a merge preview (a real search job, checking its Open in Search link), adds and removes the CIM presets, edits source options and changes settings, and restores everything afterwards; a failed run may leave an `adbtest_*` field behind. `E2E_LOCAL_ASSETS=1 scripts/e2e.sh --flow` serves the repo's built js and css to the browser instead of the deployed ones, so the UI can be tested against a real Splunk without a deploy and restart.

`scripts/e2e.sh --visual` (`tests/e2e/visual.mjs`) is the visual sweep. It opens every tab, the editors, the CIM dialog, the preview and the run history at 1440, 1000 and 700 px, with a made-up set of fields and sources injected into what the page reads (nothing is saved), and reports tooltips that are cut off, off screen or covering their trigger, text that spills or is cut without a way to read it, content past the right edge of the page and controls that overlap. Screenshots go to `dist/visual/` for a look. `E2E_LOCAL_ASSETS=1` tests the local build without a deploy.

`tests/e2e/screenshots.mjs` regenerates the README screenshots in `docs/img/` (read only, same injected configuration idea; run it with `E2E_LOCAL_ASSETS=1`). Re-run it after a UI change and commit the images.

`test_scale.py` merges 120,000 generated assets and checks a second run (a few minutes; SPL cannot generate more than 50,000 rows per `makeresults`, so the sources are appended from parts). It exists because a subsearch (`append [| inputlookup ...]`) silently stops at 50,000 results: nothing in the generated search may rely on one for asset-sized data.
