# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AssetDB is a Splunk app (no Splunk Enterprise Security required) that merges asset records from multiple lookup files into a single KV store collection (`assetdb`). The repo root is the app directory itself (`$SPLUNK_HOME/etc/apps/assetdb`). Tests, packaging and deploy tooling are described in `docs/TESTING.md`; `make lint` runs shellcheck, ESLint (`eslint.config.js`, warnings allowed, errors fail) and ruff (`pyproject.toml`); `.prettierrc` records the formatting style (not enforced).

## Commands

- Build the front-end: `npm run build` (runs `scripts/build-minjs.sh`) — Babel-transpiles `appserver/static/js/src/*.js` (browser targets in `package.json` `browserslist`) and minifies each to `*.min.js` with terser. It builds in a temp directory and only replaces the outputs if every file built. Requires `npm ci` first.
- Edit only `appserver/static/js/src/*.js`. The `*.min.js` files are committed build output (what the dashboard actually loads) and must be rebuilt after source changes.
- Python/SPL changes need no build; reload the app in Splunk (`.../debug/refresh` or restart) to pick up `.conf` changes. `local/` is gitignored and holds runtime overrides written by the UI.

- `make test` — pytest (`tests/python`, targets `bin/adbmerge_core.py`), `node --test` golden SPL tests (`tests/js`, `UPDATE_GOLDEN=1 npm test` to refresh `tests/fixtures/golden`), min.js freshness (`scripts/check-minjs.sh`), deploy mock test, shellcheck.
- `make package` -> `dist/assetdb-<version>.tar.gz`; `make inspect` (AppInspect, tags from `APPINSPECT_TAGS`, waivers in `.appinspect-waivers`); `make deploy` / `make reload` (SSH deploy to the dev server, config in gitignored `.env.local`, see `.env.example`); `make integration`; `make all` runs the pipeline (`scripts/test-all.sh --skip-deploy` for local only). Always run deploy/reload with `--dry-run` first.
- Merge logic lives in `bin/adbmerge_core.py` (pure, unit tested); `bin/adbmerge.py` is the thin splunklib wrapper. `makeMergeSearch()` is tested by evaluating the unmodified `assetdb.js` in a vm sandbox (`tests/js/load-generator.js`).

## Architecture

The pieces only make sense together:

1. **Generator** (`appserver/static/js/src/generator.js`): a pure AMD module (no DOM/REST) that turns the `assetdb.conf` field array into the merge search as typed `{kind, text}` lines (`buildSearchLines`), plus the read-only preview searches (`buildPreviewSearches`). **To change merge behaviour edit the generator**, never the saved search. Everything it emits is covered by golden files (`tests/fixtures/golden`) and by tests that run the generated SPL on a real Splunk (`tests/integration/sandbox.py`). Gotchas learned the hard way: fields that start with `_` are internal and vanish through `stats`; `mvappend` with one argument is an eval error (use `mvappendOf`); `outputlookup` with zero results empties a KV collection unless `override_if_empty=false`.
2. **Configure UI** (`default/data/ui/views/configure.xml` → `js/assetdb.min.js`, styles in `css/assetdb.css`): a Simple XML page that mounts a SPA into `#ab_config`. It renders inside a **Shadow DOM** (the stylesheet is linked into the shadow root, so Splunk's styles and ours never touch each other; Playwright pierces it, plain DOM queries do not). The theme is taken from the page background (`data-theme` on the host). Tabs: Sources, Fields, Pipeline (the generated search by stage, preview, raw search), Settings. Tables are read-only; a row has an Enabled switch (saves on its own) and Edit / Duplicate / Remove icons. Editing is **draft-and-save**: the editor card holds a draft and nothing is written until Save (a discard dialog guards every exit). All config is stored through Splunk REST in `assetdb.conf`: the `[general]` stanza holds `lookups` (a JSON array of source objects: `name`, `lookup`, `enabled`, `role`, `scope`, `max_age`, `time_field`, `filter`, `columns`) and the global settings (`max_keys`, `max_key_share`, `key_blocklist`, `ignore_values`, `min_ratio`, `runs_to_keep`, `scope_field`, `default_*`, `change_history`...); every other stanza is a field (a field may also set `enabled=0` to be left out of the merge). A save is a chain, each step reported on its own: config writes, `syncCollection()` (KV indexes, field types, the `adb_enrich_outputs` macro), then regeneration of the saved search `assetdb-lookupgen`. Row counts, columns and unreadable lookups are read once per source with one-shot searches (`inspectLookup`) and drive the warning icons. Edit only `src/*.js`; `*.min.js` are committed build output. `tests/js/load-generator.js` evaluates the real `assetdb.js` in a vm sandbox and exports `searchText`/`searchLines`, so keep the file ending in `init();`.
3. **Dashboards**: none. The Configure page (preview in Pipeline, the Run history panel in the status strip) is the only UI; the run history, overflow list and change log are plain KV collections to search.
4. **`adbmerge` custom command** (`bin/adbmerge.py` thin wrapper, `bin/adbmerge_core.py` pure logic, vendored `lib/splunklib` 3.x, Python 3.13): union-find merge of rows that share any key; enrich-only rows (`adb_auth=0`) attach to exactly one asset and never link; keys shared by more than `max_key_share` rows are skipped; clusters over `max_keys` (hard cap 100) are dropped or emitted for review (`overflow=emit`); counters are stamped on the output for the run record. The chunked protocol takes column names from the first record, hence `with_common_fields`.
5. **Storage** (`collections.conf`, `transforms.conf`): `assetdb` (merged assets), `assetdb_runs` (bounded run history), `assetdb_overflow` (last run's oversized clusters), `assetdb_changes` (bounded change log); each with a lookup definition.
6. **Macros** (`macros.conf`): `input_adb_lookup`, the `normalize_*` presets (multivalue safe, used by the generator), `adb_enrich*` (exported), `output_adb_lookup` and helpers.
7. **Templates**: disabled `assetdb-src-*` saved searches that build source lookups.

`lookups/assetdb_demo_assets.csv` is the demo source lookup registered by default in `assetdb.conf`.

## Gotchas

- The repo lives in iCloud Drive, which evicts and duplicates files: `node_modules` is a symlink to `node_modules.nosync` (iCloud skips `.nosync`), and stray `name 2.ext` copies are excluded from the package. If a build suddenly fails with a missing module, run `npm ci`.

- `python.required = 3.13` and splunk-sdk 3.x mean `adbmerge` needs a Splunk whose custom commands run on Python 3.13 (not 10.0).
- Field names `_key`, `asset`, `source`, `source_lookup`, `last_seen`, `scope`, `conflicts` are reserved (created by the merge).
- Booleans in `assetdb.conf` are `0`/`1` strings; lists (`ignore_values`, `key_blocklist`) are JSON strings; the generator parses them with fallbacks.
- Splunk Web caches app static files per build: after a deploy restart splunkd (`/_bump` is refused on Splunk Free) and hard-refresh.
- Integration/e2e tests need `.env.local` and write only to temporary objects (`adbtest_*`); the e2e flow edits the real config and restores it. If a flow run is interrupted, remove a leftover `adbtest_*` field by hand and check the saved search is `| makeresults` again.
