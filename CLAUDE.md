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

1. **Configure UI** (`default/data/ui/views/configure.xml` → `js/assetdb.min.js`): a Simple XML dashboard that mounts a custom SPA into `#ab_config`. All configuration is stored through Splunk REST config endpoints (`/servicesNS/nobody/assetdb/configs/conf-assetdb/...`), i.e. in `assetdb.conf`:
   - `[general]` stanza: `lookups` — a JSON array of `{name, lookup}` objects (the source lookup files).
   - One stanza per asset field, with properties documented in README.md ("Field Properties").
   The helper modules (`modal`, `textInput`, `radioInput`, `spinnerInput`, `multiselectInput`, `format`, `prism`) are small Splunk-MVC/jQuery widgets used by `assetdb.js`.

2. **Search generation** (`makeMergeSearch()` in `assetdb.js`): whenever lookups or fields change, the UI regenerates the full SPL merge search from the field config and writes it to the `search` attribute of saved search `assetdb-lookupgen` (`conf-savedsearches`). The `default/savedsearches.conf` entry is just a `| makeresults` placeholder with a daily cron. To change merge behavior, edit the generator in `makeMergeSearch()`, not the saved search. The generated pipeline: inputlookup each source → split multivalue fields (`|`-delimited) → lowercase/validate/ignore/fill-null → build `_key` from key fields → shallow `stats ... by _key` → `adbmerge` → `md5` of merged key set as the final `_key` → second `stats` → coalesce/trim → `outputlookup assetdb`.

3. **`adbmerge` custom command** (`bin/adbmerge.py`, registered in `default/commands.conf`, uses vendored `lib/splunklib`): a `ReportingCommand` whose `reduce` does transitive merging — assets sharing any key (even indirectly through a third asset) get the same `asset` multivalue set of keys. Assets with no keys are dropped; clusters with more than `max_keys` unique keys are dropped (counted and logged as a warning). The README's merge diagram describes this algorithm.

4. **Storage** (`default/collections.conf`, `transforms.conf`): KV store collection `assetdb` with a `lookup` definition of the same name (`fields_list = _key,asset`), so searches can use `| lookup assetdb ...` against the merged data.

5. **Macros** (`default/macros.conf`): `input_adb_lookup(1)` is used by the generated search; the others (`normalize_mac`, `normalize_os`, `host_from_dns`, `ageout_adb_lookup`, `retain_adb_lookup`, `output_adb_lookup`, `join_mv_fields`/`split_mv_fields`) are helpers for users building the per-source lookup-generation searches. Multivalue fields are stored in lookups as `|`-joined strings.

`lookups/assetdb_demo_assets.csv` is the demo source lookup registered by default in `assetdb.conf`.

## Gotchas

- `bin/adbmerge.py` has a `python2.7` shebang but `commands.conf` sets `python.version = python3`; keep the code compatible with Python 3 (and ideally 2).
- Field names `_key` and `asset` are reserved (created by the merge process).
- Field definitions in `assetdb.conf` store booleans as `0`/`1` strings (`key_field`, `case_sensitive`) and list values like `ignore_values` as JSON; the generator parses them accordingly.
