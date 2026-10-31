# Changelog

## 1.6.0

Changes since 1.4.5, the last tagged release.

### Configure page
- Rewritten: Sources, Fields, Pipeline and Settings tabs, a status strip, read-only tables with an Enabled switch and Edit, Duplicate and Remove icons, and draft-and-save editing (nothing is written until Save).
- Warning icons on rows for lookups that cannot be read, sources with no rows and fields that no enabled source supplies.
- Preview: runs the whole merge without saving and shows how many assets would be added, removed or changed, with the search job one click away in Search.
- Pipeline tab: the generated merge search as one document with an ordered stage outline.
- Run history panel with per-run counters and the oversized clusters of the last run; Run now shows progress.
- Help text in tooltips, plain wording and consistent names throughout. Light theme only, matching Splunk's page.
- New app icon and logo. Configure is the only entry in the app navigation.

### Merge
- Source options: enabled, role (authoritative or enrich only), column mapping, scope, max age, time column and row filter.
- Field options: normalizer presets, typed validation, ignore lists (values, regex, CIDR) with a global list, allowed sources, earliest, latest, min, max, average, sum and coalesce merges, conflict flags and keep original case.
- Key quality: global key blocklist and a shared-key guard. Scoped keys for the same address in different sites or tenants.
- Run safety: runs that produce far fewer assets than the last successful run are blocked, an empty result never overwrites the asset database, and every run is recorded in `assetdb_runs`.
- CIM field presets, and enrichment macros (`adb_enrich` and friends).
- `adbmerge` merges across all input chunks (previously per chunk), and the generated search is about 45% faster with no value-dropping cap.
- Seven disabled saved searches that build source lookups.
- Search head cluster readiness: `assetdb.conf` is replicated.

### Packaging and tests
- Package, AppInspect, deploy and reload scripts; unit, integration (live Splunk), end-to-end and visual-sweep tests.
- The package no longer includes iCloud conflict copies of the built files, and the archive check fails if any appear.
- Removed five unused macros (`retain_adb_lookup`, `ageout_adb_lookup`, `join_mv_fields`, `split_mv_fields`, `host_from_dns`) and unused vendored modules.
- `metadata/default.meta`: only admins can write app-level objects; the unused viewstates, props and eventtypes entries are gone.
