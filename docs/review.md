# AssetDB code review

Scope: every file in the repo except `lib/splunklib` and the committed `*.min.js` (the `src/*.js` files were reviewed instead). Reviewed at commit `9d33dd8` plus the uncommitted `lib.sh` change. **No code has been changed**; this file is the only addition.

Evidence labels used in the tables:

- **V** = verified by running something here (a test, a script, `npm audit`, AppInspect).
- **R** = reasoned from the code; I have not seen it fail.
- **S** = depends on Splunk behavior I could not confirm without a live check; it should be confirmed on `splunk.home` before or while fixing.

Line numbers refer to the current files. `core` means `bin/adbmerge_core.py`, which holds the merge logic that used to be inline in `bin/adbmerge.py`.

## Summary

The app is small and the core idea is sound. Two problems matter most:

1. **Merged asset `_key`s are not stable between runs (F-01).** The key is an md5 over an unordered set. Python randomizes string hashing per process, so the same input can produce different keys on every scheduled run. I reproduced this.
2. **Configuration values are trusted everywhere (F-02, F-03).** Lookup names, field names, regexes, fill-null values and eval expressions go into generated SPL and into the DOM unescaped. Anyone who can write `assetdb.conf` can inject script into an admin's browser and SPL into a scheduled search.

Beyond those, several merge methods compute the wrong answer (F-04), the demo lookup does not carry the column the generated search depends on (F-06), and the UI has no error handling at all, so partial writes go unnoticed (F-08).

Counts: 40 findings: 1 critical, 7 high, 19 medium, 13 low/nit.

## What is already good

- The transitive merge is correct on everything I threw at it, including bridging assets that arrive last and overflow poisoning (24 unit tests, plus a 300-seed differential test against the original code).
- Per-event work is bounded by `max_keys`, so cost is roughly linear in practice. A 50,000-asset chain test runs in well under a second.
- `npm audit` reports 0 vulnerabilities. The dependency tree is now locked (`package-lock.json`).
- `Modal`, `TextInput`, `RadioInput`, `SpinnerInput` and `MultiSelectInput` consistently `_.escape` their own ids, labels and values.
- Saved-search regeneration from config is a good design: the UI is the only writer, and the generated SPL is covered by golden tests.

## Findings

### Critical

| ID | Category | Location | Description | Recommended fix | Effort |
| --- | --- | --- | --- | --- | --- |
| F-01 | Correctness | `core:62` (`list(key_map[key])`), `assetdb.js:911` (`md5(mvjoin(asset,"::"))`) | **V.** `asset` is emitted in set-iteration order, then md5'd in order. Python 3 randomizes string hashes per process, so the order differs between runs. I ran the same 3-asset cluster under three `PYTHONHASHSEED` values and got two different md5s (`7a70fdae` vs `1e5a71b3`). Every scheduled run can therefore replace every `_key` in the KV store, which breaks anything that references an asset by `_key`. The integration test `test_merge_is_idempotent` exists to catch this and has not been run yet. | In `core`, emit `sorted(key_set)` (keeping the `MAX_KEYS_REACHED` marker as a single-item list). In the generator, `mvsort(asset)` before `mvjoin`. Add a test that runs `merge_assets` in subprocesses with different `PYTHONHASHSEED`. | S |

### High

| ID | Category | Location | Description | Recommended fix | Effort |
| --- | --- | --- | --- | --- | --- |
| F-02 | Security (XSS) | `format.js:50-53`; `assetdb.js:489, 643, 747-750, 764-792`; `textInput.js:55` | **R.** Config and lookup data is inserted into HTML with template strings and never escaped: field names, lookup names and files, `validation`, `fillnull`, `eval_expression`, `merge_order`, `ignore_values`. `format.js` is the worst: `Prism.tokenize` returns raw text, and the tokens (which contain the whole generated SPL, including every user value) are concatenated into an HTML string and passed to `$()`. A value like `<img src=x onerror=...>` in a validation regex executes in the browser of whoever opens the Configure page. Lookup file names are controllable by anyone who can upload a lookup. `setError` also inserts server error text raw. | Escape every interpolated value with `_.escape`, or build nodes with `.text()`. In `format.js` escape each token's content before wrapping. Add a golden test that feeds `<script>` through `format`. | M |
| F-03 | Security (SPL injection) | `assetdb.js:841-842` (lookup, name), `857` (fillnull), `861` (validation), `865` (eval_expression), `877-883` (merge_order) | **R.** These values are placed into the generated SPL with no escaping. A `"` in `fillnull`, `validation` or a lookup name closes the string. A backtick or `)` in a lookup file name escapes the `input_adb_lookup(...)` macro call. `eval_expression` can contain `\|`, `[` or a backtick and so start a new command. The UI regex checks (`:396`, `:591`, `:410`) are bypassed by writing the conf over REST, and they do not cover `eval_expression` at all. Impact depends on which identity runs `assetdb-lookupgen` and who can edit it (see F-13). **S:** check the saved search owner and `run_as` on the server. | One `splQuote()` helper that escapes `\` and `"`. Allow-list lookup names and files against what `/data/lookup-table-files` returns. Reject `\|`, backtick, `[` and `]` in eval expressions, or validate through `/search/v2/parser` and compare the parsed command list. Re-validate in the generator, not only the UI. | M |
| F-04 | Correctness | `assetdb.js:874-886, 908, 912` | **R.** Each single-valued merge method runs twice: once in the shallow `stats ... by _key`, once after `adbmerge`. `avg` becomes an average of averages (wrong whenever clusters are unequal). `latest` needs `_time`, but `stats` drops it, so the second pass has no timestamp and picks an arbitrary value. `min`/`max` are fine. | Keep `_time` through the first stats (`latest(_time) as _time`), and carry `sum` and `count` for `avg`, or aggregate once, after the final grouping. Add goldens plus an integration case with unequal clusters. | M |
| F-05 | Correctness | `core:50-54`, `assetdb.js:911-912` | **V (logic).** Every cluster that exceeds `max_keys` is replaced by the same `["MAX_KEYS_REACHED"]` list, so they all get the same `_key` (md5 of that string) and the second `stats by _key` merges every overflow asset in the environment into one record. That record's multivalue fields are then trimmed to `max_values`. Unrelated assets are silently conflated. | Give overflow clusters their own identity (md5 of their own first key) and keep them separate, or drop them and write the count to a status field or log. Needs your decision on which. | M |
| F-06 | Correctness / docs | `assetdb.js:842, 877, 902`; `macros.conf` (`input_adb_lookup`); `lookups/assetdb_demo_assets.csv:1` | **R, S.** `source` and `source_lookup` are derived from a `source_lookup` column that only the `output_adb_lookup` macro adds. The shipped demo CSV has no such column, and `input_adb_lookup` does not add it. For such lookups `source` is null, so the coalesce step `eval {source}_field = field` is evaluated with a null `source`, and `source`/`source_lookup` in the output are empty. Nothing in the README says the column is required. | Make `input_adb_lookup` run `eval source_lookup="$lookup$"` so any lookup works. Confirm on the live demo data first. | S |
| F-07 | Robustness | `assetdb.js:141-199, 207-214, 453-458, 481-485, 605-609, 634-638` | **R.** There is not one `.fail()` or error callback in the SPA (`grep` finds only `.always` once and two `catch {}` blocks). A field save is two parallel writes (`assetdb.conf` and `transforms.conf`), then `updateSearch()` is fired without waiting and without a failure path, and `buildContent()` re-renders immediately. If the savedsearch write fails (permissions, REST error), the UI shows the new field while the scheduled search is stale and nobody is told. The Asset Merge Search tab displays a SPL string generated client-side, not what is actually saved. `updateLookups` is a read-modify-write of the whole JSON `lookups` value from stale in-memory state (`:100-124`), so two admins can overwrite each other. | Chain writes (conf, then savedsearch), surface failures in a modal, re-generate the search on page load and compare with the saved one (offer a "Regenerate" button), and re-read before writing `lookups`. | M |
| F-08 | Correctness (data loss) | `assetdb.js:626-627` | **R.** `deleteLookup` removes the lookup from the shared `lookupArray` when the dialog is *opened*, not when confirmed. If the user clicks Cancel, the in-memory array is now missing the lookup. The next Add Lookup writes that array back and the lookup is silently dropped from the config. | Do the `splice` inside `onPrimaryBtnClick` (or work on a copy). | S |

### Medium

| ID | Category | Location | Description | Recommended fix | Effort |
| --- | --- | --- | --- | --- | --- |
| F-09 | Correctness | `assetdb.js:396` | **R.** A field named `general` passes the name regex and collides with the `[general]` stanza that stores `lookups`. | Reserve `general` (and `_time`, `host`, `index`, `sourcetype`, `linecount`, ...) in the name check. | S |
| F-10 | Correctness | `assetdb.js:853-865, 874-891`; golden `special_chars_field_names.spl` | **V.** Field names are never quoted on the right-hand side of `eval`. A name starting with a digit (`9lives`, allowed by the UI regex) parses as a number, and dotted or dashed names (`src.ip`, `dest-host`) parse as concatenation and subtraction. The coalesce branch does quote (`'${lookup}_${name}'`, `:882`), so the code is inconsistent. | Quote names (`'name'`) on the RHS everywhere; tighten the regex to `^[A-Za-z_][A-Za-z0-9_]*$`. | S |
| F-11 | Correctness | `assetdb.js:853, 899, 901` | **V.** Ignore values are HTML-escaped (`_.escape`), not SPL-escaped, so `say "hi"` becomes `say &quot;hi&quot;` in the search (golden `ignore_values.spl`). They are not lowercased for case-insensitive fields, so ignoring `Unknown` never matches because the field has been lowercased by then. An empty list (`"[]"`) is truthy, so every field gets a useless `in(field, "")` eval. | Use `splQuote`, lowercase ignore values when the field is case-insensitive, skip when the list is empty. | S |
| F-12 | Correctness | `assetdb.js:861, 899-900`; UI check `:427` | **R, S.** Validation runs after lowercasing, so a regex like `^[A-Z]{3}$` can never match a case-insensitive field. The UI validates with JavaScript `RegExp`, but Splunk uses PCRE; a pattern valid in one can fail in the other. `"` and backslashes are not escaped. | Validate against the parser endpoint, escape for SPL, document that regexes see lowercased values (or run validation before lowercasing). | M |
| F-13 | Security (permissions) | `metadata/default.meta:3-5, 12-14` | **R, S.** The default ACL is `read: *`, `write: admin, power` for everything in the app, including the saved search, `assetdb.conf` and the KV collection. Every role can read the merged asset inventory, and `power` can change the scheduled search that runs the generated SPL. `[lookups] export = system` publishes the `assetdb` lookup to all apps. Macros are not exported, although the README and macros exist for use in other apps' lookup-generation searches. | Add stanzas for `savedsearches/assetdb-lookupgen`, `collections/assetdb`, `transforms/lookups/assetdb` and the conf with `write = admin` and read limited to the roles that need it. Decide whether macros should be `export = system`. | S |
| F-14 | Correctness | `assetdb.js:857` | **R.** Fill-null is applied to key fields too. A static fill value on a key field gives every empty row the same key, which merges unrelated assets into one cluster (then into the overflow bucket, F-05). | Disallow fill-null on key fields in the UI and the generator. | S |
| F-15 | Robustness | `assetdb.js:268, 661, 825, 853` | **R.** `JSON.parse` is unguarded on conf values. One malformed `ignore_values` or `lookups` value makes `buildContent` or the generator throw, leaving the page blank without an error. `getLookupArray` is the only place with a fallback. | `safeParse(value, fallback)` helper used everywhere. | S |
| F-16 | Robustness | `assetdb.js:891`; `spinnerInput.js:53-70, 72-74` | **R.** `max_values` is `parseInt`'d without range checks. Missing gives `NaN`, and a typed `-5` gives `mvindex(f,0,-6)` (negative index semantics). The minimum of 2 is only enforced by the +/- buttons. | Clamp in the generator (`Math.max(1, ...)`) and validate on save. | S |
| F-17 | Correctness | `core:19-22, 29-31` | **V.** `list.remove('')` removes only the first empty string, so a second `''` becomes a real key and links assets together. `None` and whitespace-only keys are treated as real keys; keys are neither stripped nor case-folded in the command (case-folding only happens upstream for fields marked case-insensitive). Pinned by tests so changes are visible. | Filter falsy and whitespace-only keys, `strip()` keys, copy the input list instead of mutating it. | S |
| F-18 | Performance | `core:12-60` | **V (measured), R.** Per-event cost is bounded by `max_keys`, so it is roughly O(n x max_keys), not O(n^2). But the command materializes every event (`event_map`, then a second list `merged`), runs single-threaded on the search head (`reduce`), and allocates a new set per event. Memory grows linearly with asset count. `max_keys` has no upper bound. | Replace set-merging with union-find (path compression); keep only `(index, first_key)` per event and a component id; add an upper bound on `max_keys`. Measure at 500k+ before and after. | M |
| F-19 | Operability | `adbmerge.py` (end of `reduce`), `core` | **R.** The two summary lines are logged at WARNING on every run, even when the counts are 0, which pollutes `python.log` and trips naive log checks. Assets without keys are dropped with no trace in the output. | Log at INFO, WARNING only when a count is non-zero. | S |
| F-20 | Compatibility | `adbmerge.py:1`; `commands.conf:2`; AppInspect `check_commands_conf_python_required` | **V (AppInspect), S.** The shebang says `python2.7`; `commands.conf` sets `python.version = python3`. AppInspect (cloud) fails because `python.required` is missing. The dev server is Splunk 10.4.2, where `python.version` has been superseded. Whether the command runs there is not yet confirmed. | Decide the supported Splunk range, set `python.required`, fix the shebang, run `test_adbmerge_*` on the server. | S |
| F-21 | Operability | `assetdb.js:916` | **R, S.** `outputlookup assetdb` rewrites the whole collection. Splunk empties it before writing, so searches that read `assetdb` during the run see an empty or partial collection, and a failure mid-write leaves it partial. | Test the behavior at scale on the server; if confirmed, write with a run id and delete stale rows afterwards, or document the window. | M |
| F-22 | Maintainability | `assetdb.js:7-12`, `format.js:1`, `assetdb.js:708-709` | **R.** JS modules are loaded from absolute `/static/app/assetdb/js/*.min.js`, and the links to Run Search and Edit Schedule are absolute `/app/...`, `/manager/...`. These ignore locale and `root_endpoint`, and the static URLs have no cache-busting, which is why a stale browser cache survives deploys. | Use Splunk's `make_url` or app-relative module paths. | M |
| F-23 | UX / compatibility | `configure.xml:1`; `assetdb.css:11, 17-23` | **R, S.** `theme="light"` is hard-coded and the CSS uses fixed `#fff` and grey borders, so the page ignores Splunk 9.x/10 dark mode. | Drop `theme`, use Splunk CSS variables or `prefers-color-scheme`. | M |
| F-24 | Operability | `savedsearches.conf` | **R.** Ships enabled with `| makeresults`, which does nothing but runs daily. No `schedule_window`/`allow_skew`, no `dispatch.max_time`, no `schedule_priority`. `dispatch.earliest_time = -24h@h` is irrelevant for lookup searches. Fixed `0 0 * * *` means every install fires at the same moment. | Ship disabled until configured, add `schedule_window`, set a sensible `dispatch.max_time`, drop unused dispatch keys. | S |
| F-25 | Data model | `collections.conf`; `transforms.conf:5` | **R.** The only declared field is `asset` as `string`, but its value is multivalued. All other fields are untyped. `fields_list = _key,asset` is replaced at runtime by the UI (`assetdb.js:150-165`) with a different list, so default and runtime disagree. `case_sensitive_match = false` on a KV lookup has no effect that I could confirm (**S**). | Declare types for the fixed fields, document accelerations, make `transforms.conf` match what the UI maintains. | S |
| F-26 | Build | `package.json:7` | **R.** The build is a `;`-chain without `set -e`: a failed `babel` does not stop the following steps, `rm *.min.js` runs before the new files exist (partial output on failure), and the exit status is that of the last loop iteration. No browser targets, so everything is transpiled to ES5 with helpers. `main` points to a file that does not exist. Reproducibility was poor before the lockfile; committed `*.min.js` are now guarded by `scripts/check-minjs.sh` and CI. | Replace with a small script that builds into a temp dir, fails on any error, then swaps. Add `browserslist`. | S |
| F-27 | Docs | `README.md:21`; `assetdb.js:293-302`; `assetdb.js:384, 791, 865` | **V.** README says predefined fields are provided by default; `default/assetdb.conf` contains none, so a fresh install shows the "add at least one field" warning. README documents a Field Type "Eval", but the UI offers only Single and Multivalue. Eval code paths exist but are unreachable, and the eval-expression box appears for every type and is never validated (the parser check at `:384` only runs for type `eval`). | Either restore the Eval type or delete the dead code and the README row; validate expressions for all types. | S |

### Low / nit

| ID | Category | Location | Description | Recommended fix | Effort |
| --- | --- | --- | --- | --- | --- |
| F-28 | Quality | `assetdb.js:224`, `:1` | Leftover `console.log(fieldArray)` and `//# sourceURL`. | Remove. | S |
| F-29 | UX bug | `assetdb.js:374` | `field ? 'Edit Field' : 'Add Field'`: `field` defaults to `{}`, which is truthy, so the title is always "Edit Field". | Test `field.name`. | S |
| F-30 | UX bug | `assetdb.js:750, 780` | A stray `'}` is left in the row templates and ends up rendered as text. | Delete. | S |
| F-31 | UX | `assetdb.js:772` | `JSON.stringify(field.content?.ignore_values)` double-encodes a string that is already JSON. | Parse, then join for display. | S |
| F-32 | Quality | `textInput.js`, `radioInput.js`, `spinnerInput.js`, `multiselectInput.js` | The same group markup and help-block code is duplicated four times. `for="control-key"` is wrong in three of them, which breaks label-to-input association; ids are not guaranteed unique. | Shared helper; correct `for`. | S |
| F-33 | Dependencies | `appserver/static/js/src/prism.js:1` | Prism 1.17.1 (2019). Newer releases fixed ReDoS advisories (for example CVE-2021-3801, CVE-2021-23341) in other languages' definitions. Only `splunk-spl` is bundled and no plugins are used, so exposure looks low, but I have not verified it per advisory. | Update, or replace with a small SPL tokenizer. | S |
| F-34 | Dependencies | `lib/splunklib/__init__.py:34` | **V.** Vendored Splunk SDK 1.7.3. AppInspect wants 2.0.2 or later. | Upgrade and re-test on the server. | M |
| F-35 | Quality | `macros.conf` | `normalize_os` hard-codes macOS release names and has overlapping patterns whose order matters. `join_mv_fields`/`split_mv_fields` use `foreach *` and therefore touch internal fields. `normalize_mac` repeats one pattern six times. | Tidy and unit-test the regexes. | S |
| F-36 | Docs | `package.json:15` vs `LICENSE` | `package.json` says ISC; `LICENSE` is GPL-3.0. | Make them agree. | S |
| F-37 | Docs | `README.md` | Typos ("unqiue", "Wether", "seperated", "mutlivalue"). | Fix. | S |
| F-38 | Quality | `assetdb.js:910` | `max_keys=25` is a magic number inside the generator and the SPL. | Expose in `[general]` of `assetdb.conf`. | S |
| F-39 | Design | `assetdb.js:915` | No `_time`/last-updated field is written to the merged records, so staleness cannot be seen. | Add `last_seen` (max of source `_time`). | S |
| F-40 | Quality | `assetdb.css:2, 8, 71` | `!important` used for layout overrides and a global `table` selector; fine today because the CSS only loads on this one dashboard. | Scope selectors under `#ab_config`. | S |

## Splunk best practices / AppInspect

AppInspect (cloud tag) on the packaged tarball: 0 failures after the two fixes already made (`[id]` stanza; `slides.gif` not packaged), 2 waived failures (F-20 and F-34), 6 warnings. The remaining warnings are informational (SplunkJS telemetry note, Python 2/3 notice, SHC conf replication, collections.conf present, `admin` vs `sc_admin` in `default.meta`, synthetic public IPs in the demo CSV).

Items not covered by AppInspect:

- **KV store.** See F-21 and F-25. There is no `enforceTypes` and no declared types for the merged fields; only `asset` is accelerated.
- **Scheduling.** See F-24.
- **Splunk 9.x/10.x.** Python declaration (F-20), dark mode (F-23), SplunkJS dashboards still work but `simplexml/ready!`, `mvc.createService` and the absolute static URLs (F-22) are the parts most likely to break across versions.
- **File hygiene.** Packaging already strips hidden files, `.pyc`, `local/` and sets 644/755; there is nothing further to fix in the repo itself.

## Security notes

- **CSRF/REST.** All writes go through `mvc.createService()`, which carries Splunk's form key, so there is no separate CSRF problem in the SPA. Every call uses the `nobody` namespace, so config is app-global and the ACL in F-13 is the only protection.
- **URL building.** `assetdb.js:141, 169, 198, 209` concatenate field names into REST paths without `encodeURIComponent`. Names come from the server and are restricted by the UI, so the risk is limited to someone who can already write the conf.
- **adbmerge.** Takes no external input besides events and `max_keys`; logs contain only counts, no data. Resource exhaustion is possible through huge clusters or an unbounded `max_keys` (F-18).
- **Dependencies.** `npm audit`: 0 vulnerabilities. Vendored SDK and Prism are noted in F-33 and F-34.

## Proposed lint / format configuration (not added yet)

`.eslintrc.json` (plus `.prettierrc` with the existing style: tabs, single quotes, 140 columns):

```json
{
  "root": true,
  "env": { "browser": true, "es2021": true, "amd": true },
  "extends": ["eslint:recommended"],
  "parserOptions": { "ecmaVersion": 2021 },
  "ignorePatterns": ["**/*.min.js", "appserver/static/js/src/prism.js", "node_modules/"],
  "rules": { "no-console": "warn", "eqeqeq": "warn", "no-unused-vars": "warn" },
  "overrides": [{ "files": ["tests/**/*.js"], "env": { "node": true } }]
}
```

```json
{ "useTabs": true, "singleQuote": true, "printWidth": 140 }
```

`pyproject.toml` for the Python (the `lib/` tree is excluded):

```toml
[tool.ruff]
line-length = 120
extend-exclude = ["lib"]
[tool.ruff.lint]
select = ["E", "F", "W", "B", "UP006"]
[tool.black]
line-length = 120
extend-exclude = "lib"
```

Tests: a pytest suite for the merge logic and a golden-file Node test for `makeMergeSearch` already exist (`tests/python`, `tests/js`, 24 and 16 tests). Each fix below adds a failing test first.

## Prioritized fix plan

Each step is one independently committable change. A star marks steps that touch `src/*.js` and therefore need `npm run build` and a refreshed `*.min.js` (the freshness check in `make test` enforces it).

| Step | Fixes | Notes |
| --- | --- | --- |
| 1 | F-01 (core), F-17, F-19 | `sorted()` assets, strip/filter keys, INFO logging; add the hash-seed subprocess test. No JS. |
| 2 | F-01 (SPL) | `mvsort(asset)` in the generator, regenerate goldens. ★ |
| 3 | F-06 | `input_adb_lookup` adds `source_lookup`; verify on the live demo data; update README. No JS. |
| 4 | F-02 | Escape everything rendered in the DOM and in `format.js`. ★ |
| 5 | F-15, F-16 | `safeParse`, clamp `max_values`. ★ |
| 6 | F-03, F-10, F-11, F-12, F-14 | `splQuote`, quoted field names, allow-lists, ignore-value and validation fixes, no fill-null on keys; goldens updated. ★ |
| 7 | F-04 | Single-aggregation merge methods; integration case with unequal clusters. ★ |
| 8 | F-05 | Overflow clusters keep separate identities (**needs your choice**: keep apart or drop). core + ★ |
| 9 | F-07, F-08, F-09, F-29, F-30, F-31, F-28 | Sequenced writes with visible failures, deleteLookup fix, reserved names, UI bug fixes. ★ |
| 10 | F-13 | `default.meta` ACLs for conf, saved search, collection and lookup. **Needs your decision** on which roles may read the asset data. No JS. |
| 11 | F-24, F-25, F-38 | Saved search defaults, collection/transforms schema, `max_keys` in config. ★ (for `max_keys`) |
| 12 | F-18 | Union-find rewrite of `merge_assets`, measured before and after at 500k+. |
| 13 | F-22, F-23 | Relative module paths and links, dark-mode-safe CSS. ★ |
| 14 | F-26 | Replace the npm build chain with a fail-fast script; add `browserslist`. Rebuild all min.js. ★ |
| 15 | F-20, F-34 | `python.required`, shebang, SDK upgrade, then remove the two waivers. **Needs the Splunk version/range to support** and a live run. |
| 16 | F-21 | Confirm and, if needed, change the `outputlookup` strategy. Needs live measurement. |
| 17 | F-27, F-32, F-33, F-35, F-36, F-37, F-39, F-40 | Docs and housekeeping, ESLint/Prettier/ruff configs. ★ for JS changes |

## Decisions I need from you before starting

1. **Overflow clusters (F-05):** keep them as separate records, or drop them and only report the count?
2. **Permissions (F-13):** should only `admin` write the config and saved search, and which roles may read the merged assets?
3. **Supported Splunk versions (F-20):** I need the range to choose `python.required`; the dev server is 10.4.2.
4. **Live checks (S items):** may I run the read-only parts on `splunk.home` (saved search owner and `run_as`, `outputlookup` behavior, demo lookup output) once we get to those steps? Deploy and restart still need your explicit go-ahead.

## Implementation status

Decisions taken: overflow clusters are dropped (counted in the log); writes limited to `admin`; support Splunk 10.0+, later overridden: to pass AppInspect the app uses splunk-sdk 3.0.1 and `python.required = 3.13`, so `adbmerge` needs a Splunk that runs commands on Python 3.13 (not 10.0, which uses 3.9).

| Step | Status |
| --- | --- |
| 1-12 | Done, one commit each (F-01 to F-19 except F-21/F-39/F-32/F-33/F-35/F-40; F-24, F-25, F-38) |
| 14 | Done (F-26) |
| 15 | Done locally (F-20, F-34); needs a run on the live server |
| 17 | Partly done: F-36, F-37, F-27 (README only; the dead eval code remains) |
| 13 | **Not done**: absolute module paths/links and dark-mode CSS can only be verified in a browser on the server |
| 16 | **Not done**: F-21 needs live measurement of `outputlookup` |
| 17 (rest) | Not done: F-32, F-33, F-35, F-39, F-40, lint configs |

**F-21 measured (Splunk 10.4.2):** 45,000-row KV collection rewritten with `outputlookup` while 6 readers polled it, 8 rewrites of about 2s: 209 of 212 reads saw 45,000 rows and 3 returned no result rows, so a short empty window exists. Failure mid-write was not reproduced. Documented in the README instead of double-buffering the collection. Also found: `inputlookup` on a KV collection is capped at 50,000 rows by default.
