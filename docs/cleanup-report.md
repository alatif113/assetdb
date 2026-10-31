# AssetDB cleanup report (final)

Branch `cleanup/release-prep`, 9 commits on top of `main` (7ca8849). Nothing was deployed, tagged or pushed. Version is now **1.6.0** (build 1).

## What was removed

| What | Files | Size |
|---|---|---|
| iCloud conflict copies, tracked (`appserver/static/js`, `tests/e2e`) | 239 | 2.1 MB |
| iCloud conflict copies, untracked (deleted from disk) | 82 | 2.4 MB |
| Unused vendored `lib/splunklib/ai` and `modularinput` | 29 | 260 KB |
| `mockups/` (prototype, screenshots, icon concepts) | 45 | 1.6 MB |
| `docs/review.md`, `docs/ux-review.md`, `docs/feature-proposals.md` | 3 | 80 KB |
| `.prettierrc`, prettier, pytest-cov | 1 + 2 packages | small |
| 5 unused macros, 5 unused CSS rule groups, 3 unused `catch` bindings | | small |

Tracked tree: 442 files / 6.9 MB to 127 files / 2.8 MB. Package: 260 entries / 668 KB to 47 files / **305 KB**. All deletions are `git rm`, so they are recoverable from history (the copies stay in history; history was not rewritten).

## Fixed

- `scripts/package.sh` excluded only single-digit conflict copies; 166 shipped in the 1.5.7 tarball. It now excludes any digits, and the archive check fails on a conflict copy or on `tests/`, `scripts/`, `docs/`, `mockups/`, `dist/`.
- `.gitignore` rewritten (env files except `.env.example`, caches, coverage, build output, editor files, conflict copies, `local/`, `local.meta`); `.gitattributes` added (LF, binary types). `.env.example` restored.
- `metadata/default.meta`: app-level write limited to admin; the world-writable `[viewstates]` and the empty `[props]` / `[eventtypes]` exports removed.
- Trailing whitespace and missing final newlines normalized (min.js unchanged by rebuild).
- README: seven source templates (was four), current setting names, heading and typo fixes. `CHANGELOG.md` added. `CLAUDE.md` and `docs/TESTING.md` updated.
- `tests/shell/deploy-mock-test.sh` no longer hardcodes the version or picks up old tarballs.

## Kept, and why

- `static/slides.gif` (628 KB): the README loads it from GitHub; you did not answer this one. It is excluded from the package.
- `lookups/assetdb_demo_assets.csv` (648 KB): the default demo source (AppInspect warns about its public-looking IPs; waiving not needed, it is a warning).
- `[id]` stanza in `app.conf`: duplicate of the version, but the package check and AppInspect need it.
- 13 ESLint `==` warnings: changing them risks behaviour for no gain. `searchText` in `assetdb.js` is used by the test sandbox.
- Hostname `splunk.home`: only in `.env.example`, `docs/TESTING.md` and the deploy mock test, as a placeholder.

## Secrets

None found in files or in history (`SPLUNK_TOKEN=dummy` in a test mock is the only match). `.env.local` is ignored and was never committed. No rotation needed. Old commits contain inline source maps from earlier builds; the current `*.min.js` have none and no `console.log`.

## Checks

- Unit tests: 72 JS, 52 Python pass; shellcheck, ruff and ESLint clean (0 errors, 14 warnings); min.js match a fresh build.
- Not re-run after the cleanup: the live integration tests and the e2e flow and visual sweep (they need a deploy, which you have not asked for). The removed macros are not used by the generator or any test.
- `npm audit`: 7 moderate findings, all in dev tooling (`minimatch` via ESLint and `@babel/cli`), none ships. Not force-upgraded.
- AppInspect (cloud tag): 0 failures, 0 errors, 6 warnings (collections.conf present, threading and Python script notices, SplunkJS notice, public IPs in the demo CSV, knowledge-object access). Nothing waived.
- Icons present at correct sizes: appIcon 36, appIcon_2x 72, appIconAlt 36, appIconAlt_2x 72, appLogo 160x40, appLogo_2x 320x80.

## Package: `dist/assetdb-1.6.0.tar.gz`

305,171 bytes, sha256 `2bc074f669d16d4698067067322957a8a11a502df5d7af7f408b13a8b52038f1`, one top-level directory `assetdb`, no tests, scripts, docs, mockups, dist, local, hidden files or conflict copies.

```
assetdb/
  CHANGELOG.md  LICENSE  README.md
  appserver/static/css/{assetdb,page}.css
  appserver/static/js/{assetdb,format,generator}.min.js
  bin/{adbmerge,adbmerge_core}.py
  default/{app,assetdb,collections,commands,macros,savedsearches,server,transforms}.conf
  default/data/ui/nav/default.xml  default/data/ui/views/configure.xml
  lib/splunklib/{__init__,binding,client,data,results,utils}.py
  lib/splunklib/searchcommands/ (11 files)
  lookups/assetdb_demo_assets.csv
  metadata/default.meta
  static/{appIcon,appIcon_2x,appIconAlt,appIconAlt_2x,appLogo,appLogo_2x}.png
```

## Still open

- Regenerate the README screenshots / `slides.gif` (you said this is a future step), then decide whether to keep the gif.
- Decide whether to shrink the demo CSV.
- Run the integration tests, e2e flow and visual sweep after deploying 1.6.0 (`scripts/deploy.sh --dry-run`, then `--yes`).

## Release checklist (manual)

1. Review the branch and merge `cleanup/release-prep` into `main`.
2. Deploy to the dev server (dry run first), restart splunkd, run `make integration` and `scripts/e2e.sh --flow --visual`.
3. Tag `v1.6.0` and push the tag.
4. Upload `dist/assetdb-1.6.0.tar.gz` (sha256 above) wherever it is published; paste the CHANGELOG entry as the release notes.

## Original inventory findings

1. **239 iCloud conflict copies are committed** ("assetdb.min 14.js", "generator.min 20.js", "probe 2.mjs", and so on): 236 in `appserver/static/js/`, 3 in `tests/e2e/`. 2,140 KB. They entered history in 366b6fe, b2e7cbc, f6fa687, f73c34c, d594a43 (168 of them) and 8a5a8bf. Another 82 are untracked (2,392 KB) in `appserver/`, `lib/splunklib/`, `mockups/`, `tests/`.
2. **166 of them ship in the package.** The exclusion in `scripts/package.sh` is `'* [0-9].*'` and `'* [0-9]'`, which only matches a single digit. "min 10.js" and up get through. `dist/assetdb-1.5.7.tar.gz` currently holds 166 such files. AppInspect did not flag them.
3. **`.env.example` is deleted in the working tree** (tracked, not staged). It is needed (the docs and `scripts/lib.sh` point to it). Restore with `git checkout -- .env.example`.
4. **`metadata/default.meta` `[viewstates]` is writable by everyone** (`write : [ * ]`). It is a stock Splunk comment ("even normal users should be able to create shared viewstates") but this app has no viewstates. See ASK.
5. **`lib/splunklib/ai/` (212 KB, 15 files, needs langchain) and `lib/splunklib/modularinput/` (48 KB) are not used by `adbmerge`.** Nothing outside those folders imports them. About 260 KB of a 668 KB package.
6. **No CHANGELOG.** The README has stale text (listed below).

## Secrets, hosts and personal data

- No credentials in tracked files or history. `git grep` over all revisions for `SPLUNK_TOKEN=` / `SPLUNK_PASSWORD=` followed by a value finds only `SPLUNK_TOKEN=dummy` in `tests/shell/deploy-mock-test.sh`. `.env.local` is ignored and was never committed. **No rotation needed.**
- `eyJ` (base64 JSON) appears in the history of old min.js commits (386faa1, 6b2ef55): inline source maps from earlier builds. The current `*.min.js` contain no `sourceMappingURL`, `console.log` or `debugger`.
- The internal host name `splunk.home` is in: `.env.example`, `docs/TESTING.md`, `docs/review.md` (2 places), `tests/shell/deploy-mock-test.sh`. No IP addresses and no `/Users/` paths in tracked files. The GitHub user `alatif113` is in `README.md` and `package.json` (public repo URL, fine). Your name is the app author in `app.conf` and `package.json` (intended).
- Recommendation: keep `splunk.home` in `.env.example` as the placeholder and in the test mock; reword it in the docs (`review.md` is a REMOVE candidate anyway).

