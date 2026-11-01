# Changelog

## 1.6.0

Changes since 1.5.7.

### Breaking changes

**Requirements**
- **`adbmerge` needs Python 3.13.** `commands.conf` now sets `python.required = 3.13` and the app ships splunk-sdk 3.0.1. Splunk 10.0, which always runs commands on its bundled Python 3.9, can no longer run the command. Use a Splunk version that can run commands on Python 3.13 (tested: 10.4.2).

**Removed macros.** Searches that use them stop working:
- `retain_adb_lookup(2)`, `ageout_adb_lookup(2)`, `join_mv_fields`, `split_mv_fields` and `host_from_dns(2)`. The merge never used them. Copy the definitions from 1.5.7 `macros.conf` into your own app if you rely on them.

**Changed macros**
- `input_adb_lookup(lookup)` also sets `source_lookup` (to the lookup name when the lookup has no such column).
- `normalize_mac` now lowercases the result (it kept the case as written), and `normalize_mac` and `normalize_os` work on multivalue fields. `normalize_os` recognizes more systems (OS X, Darwin, Sonoma, Sequoia, Tahoe).

**Merge results can differ from 1.5.7**
- `adbmerge` now merges across all input chunks. Before, rows more than one chunk (about 20,000 events) apart were silently left unjoined, so large inputs produced more, smaller assets. Expect fewer assets after upgrading.
- Defaults that skip data: keys found in more than **50** rows are no longer used for matching (*Max rows per key*), and a key blocklist (all-zero and broadcast MACs, `0.0.0.0`, `::`, loopback, link-local, `localhost`, `unknown`, `none`, `null`, `n/a` and similar) is applied to every key field. Both can be changed or turned off in Settings.
- **Run safety is on by default.** A run that produces fewer than 50% of the assets of the last successful run is not saved (status `blocked_low_count`), and a run with no assets never overwrites the asset database. If your inventory legitimately shrinks by more than half, lower *Minimum size vs last run*.
- Multivalue fields over *Max values* now keep the most recent values (by `_time`). Before, they kept the alphabetically first. Set *Value order* to *Alphabetical* to get the old behavior. *Max values* is limited to 1 to 100.
- *Fill null* is applied after the merge, only to assets with no value at all. Before, it was added per source row and competed with real values.
- *Keep original case* is rejected with the host name, FQDN, user name, email and OS normalizers, which lowercase the value and defeated it. Fields with that combination must change one of the two.
- The `assetdb` collection has new columns: `source`, `source_lookup`, `last_seen`, `scope` and `conflicts`. Existing columns are unchanged.

**Saved search and permissions**
- `assetdb-lookupgen` no longer sets `dispatch.earliest_time` or `dispatch.latest_time`, and has a 60 minute schedule window. It is rewritten the first time you save on the Configure page; until then your scheduled runs use the old search text.
- Only the `admin` role can write the app's configuration, saved search, collections and lookup definitions. Before, `power` could write app-level objects. The world-writable `viewstates` entry and the unused `props` and `eventtypes` exports are removed from `default.meta`.
- The app navigation has one entry, Configure. The Search entry is gone (use the Search app).
- `assetdb.conf` is now replicated in search head clusters (`server.conf`).

**Configuration compatibility.** `assetdb.conf` keeps its existing keys; the new ones (`enabled`, `key_scope`, `validation_type`, and so on) are optional, so a 1.5.7 configuration loads as it is.

### Configure page
- Rewritten: Sources, Fields, Pipeline and Settings tabs, a status strip, read-only tables with an Enabled switch and Edit, Duplicate and Remove icons, and draft-and-save editing (nothing is written until Save).
- Warning icons on rows for lookups that cannot be read, sources with no rows and fields that no enabled source supplies.
- Preview: runs the merge without saving and shows how many assets would be added, removed or changed, with the search job one click away in Search.
- Pipeline tab: the generated merge search as one document with an ordered stage outline.
- Run history panel with per-run counters and the oversized clusters of the last run. Run now shows progress and links to the job.
- Help text in tooltips, plain wording and consistent names. Light theme only, matching Splunk's page.
- New app icon and logo.

### Merge
- Source options: enabled, role (authoritative or enrich only), column mapping, scope, max age, time column and row filter.
- Field options: normalizer presets, typed validation, ignore lists (values, regex, CIDR) with a global list, allowed sources, earliest, sum, min, max, average and coalesce methods, conflict flags, keep original case, value type and description.
- Key quality: global key blocklist and shared-key guard. Scoped keys for the same address in different sites or tenants.
- Run history in `assetdb_runs`, oversized clusters in `assetdb_overflow`, and the disabled alert search `assetdb-run-alert`.
- CIM field presets and the enrichment macros `adb_enrich`, `adb_enrich_mac`, `adb_enrich_ip`, `adb_enrich_host`, `adb_enrich_scoped` and `adb_enrich_with`.
- The generated search is about 45% faster, with no cap on the number of values kept.
- Seven disabled saved searches that build source lookups.

### Packaging and tests
- Package, AppInspect, deploy and reload scripts; unit, integration (live Splunk), end-to-end, visual-sweep and screenshot scripts.
- The package no longer includes iCloud conflict copies of the built files, and the archive check fails if any appear. The package is 305 KB (was 668 KB).
- Removed unused vendored modules (`splunklib.ai`, `modularinput`).

## 1.5.7

The previous release. See the git history before 2026-10-30.
