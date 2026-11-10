# Changelog

## 1.7.1

Fixes found by a comprehensive test of ten sources, the merge and both dashboards (see docs/TESTING.md).

- **The Explorer showed sources as "differs" when they agreed.** The per-source values were read raw, before the normalizers, validation and ignore lists, and compared with the merged value: a MAC with dashes, an FQDN with a trailing dot, an operating system name against its family, a tag list with an ignored value, a number written 5.0 against 5. `adb_provenance` now reads each source the way the merge does (allowed sources, normalizers, case, validation, ignore lists, eval expressions, numbers). It is rewritten the next time you open or save on the Configure page.
- **The Explorer missed a source's row when it knew the asset only by a spelling of its MAC address** that the merge normalizes (dashes, dots, upper case). Fixed by the same change, since the asset's keys are now matched against normalized values.
- **Coverage: the "All assets" row counted an asset once per group** when grouped by a field with several values (tags, IP addresses, categories), so it showed more assets than exist and a skewed share per source. The search now returns the pseudo-group `adb_all` (every asset once) and the heatmap pins it. Other rows are unchanged.

## 1.7.0

Changes since 1.6.0.

### Changes that affect existing searches and results
- **`input_adb_lookup(lookup)` always names the lookup it reads.** A `source_lookup` column inside the lookup is now ignored: a lookup that is a copy of a merged result (or was renamed) carried the old name, which made its rows count as another source. The macro leaves an `adb_src` helper column in your own searches that use it; drop it with `fields - adb_src`.
- **The Explorer's "differs" rule is new.** See *Fields differ* below.
- **The Configure page has a dark theme** and is dark by default; it follows a light Splunk preference.
- Source names may contain spaces and punctuation (see below). Existing names keep working.

### Explorer and Coverage, themes, navigation
- Two new classic dashboards in the app menu, **Explorer** and **Coverage**, built on two custom visualizations that ship in the app. The Explorer searches assets (100 at a time, most recently seen first), lists the fields of the selected one and shows which source supplied each value. Coverage is a heatmap of the share of assets each source covers, grouped by any field; a click on a cell opens a search of that group's assets in a new window. The visualizations also ship as Dashboard Studio visualizations (`assetdb.adb_heatmap`, `assetdb.adb_asset_explorer`, Splunk 10.4 or later).
- **Themes.** Configure, Explorer and Coverage are dark by default (`theme="dark"` in their XML, so there is no light flash) and switch to light for a user whose Splunk preference is light. The Configure page has a dark theme. Splunk Web does not theme classic dashboards from the user's preference (it reads only a `theme` attribute or a `?theme=` parameter), so the pages read the preference and reload once with `?theme=` when it differs.
- The Configure page opens on the Sources tab. Adding a source no longer shows a table of sample rows (the row and column counts remain).
- **Source names are friendly names**: spaces and punctuation are allowed (up to 64 characters, no quotes, backslashes, commas or backticks). The priority merge, which builds field names from source names, uses a safe form of the name and refuses two names that only differ in spaces or punctuation.
- Source columns are mapped to fields by a macro, `adb_map_column(field, lookup, column)`; a column already named like its field needs no mapping, so the merge search is shorter.
- The app menu has icons (Splunk 10.4 or later): Configure, Explorer, Coverage.
- *Fields differ* in the Explorer compares each source with the merged (final) value of the asset. A source agrees when everything it holds is part of that value (case, spacing, order and repeats are ignored, so one of several IPs agrees); it differs when it holds a value the merged one lacks, or none. The count under the asset name and the list it opens use the same rule. The "Most differences" sort is gone: it could only count differences between records, not between sources.
- **Skeletons**: Configure, Explorer and Coverage show gray placeholder shapes from the first paint, instead of a blank page or "Loading…", until their data is in.
- In the Explorer a source is a badge tinted with its color. While the sources of a newly selected asset are being fetched the field rows show a skeleton; the "not available" note only appears once the answer is in and empty.
- Sources are never named in the visualizations, so any set of sources and fields works. Source colors come from a ten-color palette that rotates after ten.
- New macros: `adb_icon`, an eval statement you write that sets one of a fixed list of icons from any field of the asset (every asset has an icon, the generic Other one by default; the Settings tab explains it and links to the macro), and `adb_provenance(<_key>)` (what each source holds for one asset), which the Configure page keeps up to date when it opens and when it saves.
- The dashboards are generated by `scripts/build-dashboards.py` and the visualizations are built from `viz/` by `npm run build:viz`; `make test` fails if either is stale.

### Merge and provenance
- `input_adb_lookup` always names the lookup it reads and ignores a `source_lookup` column in it, so a lookup that is a copy of a merged result still counts as its own source. It leaves an `adb_src` helper column in searches that use it; drop it with `fields - adb_src` if you do not want it.
- `adb_provenance` is built from two shared macros, `adb_prov_match(2)` and `adb_prov_end(3)`, instead of repeating the same steps for every source.
- The merge steps (run guard, run record, overflow list) are macros; the integration tests expand them and refuse any search that would write to the real run history or overflow list.

### Source templates

- **Ten more vendor templates** (36 in all), each written from the add-on's own code: runZero, Nozomi Networks, Claroty xDome, HCL BigFix, ManageEngine Endpoint Central, Trellix ePO, Device42, Workspace ONE UEM, Cisco Secure Endpoint and Symantec Endpoint Protection. The ManageEngine, Workspace ONE and Symantec add-ons do not collect an inventory, so their templates say they are a weak fit. The Active Directory template now reads the last logon and the manager.
- **Vendor logos.** A source shows its vendor's logo on the Configure page, in the Explorer and on the Coverage page, picked from keywords in its name or lookup name. Sources with a logo have a standard badge color in the Explorer; only the others are tinted. The logo is chosen automatically; there is no setting.
- 19 new disabled saved searches build a source lookup from a vendor's Splunk add-on: ServiceNow CMDB, Qualys VMDR, Rapid7 InsightVM, Armis, Axonius, Lansweeper, Jamf Pro, AWS EC2, SentinelOne, Tanium (inventory and Discover), VMware Carbon Black Cloud, Azure virtual machines, Microsoft Entra ID devices, Google Cloud, Palo Alto Cortex XDR, Forescout, Cisco Meraki and Wiz. The field names were read from each add-on (its props.conf aliases and extractions, its lookups, its input code and samples); where an add-on only passes the vendor's record through, the names come from the vendor's API and the description says so.
- The CrowdStrike template was wrong for the real add-on: it stores the Hosts API record under `falcon_device.` and the sourcetype is `crowdstrike:device:json`. The Tenable template now reads the aliases the add-on creates (and the per-interface arrays), leaves out terminated assets and no longer takes an address for a host name. Both are version 2.
- Tests run every vendor template on events shaped like the add-on's, on a real Splunk.

### Performance and large estates
Measured on 500,000 rows / assets on Splunk 10.4.2 (searches reviewed one by one):
- **The merge no longer loses results past 200 MB.** The step that joins the merged keys back to the rows used `eventstats`, which keeps every event in memory and, past `max_mem_usage_mb` (200 MB by default), silently drops results: a 500,000 row source produced 450,608 assets instead of 499,670 (Splunk only logs a warning). It is a `stats` now (it spills to disk); the output is identical (checked on field checksums, overflow clusters included), it is about 20% slower below the limit.
- **Explorer**: 7.5 s to about 1.7 s at 500,000 assets. The assets and their count are two searches that run side by side (`sort 100` instead of `sort` plus `head`, and a streaming `stats count` instead of `eventstats`), and the search text is only evaluated when something was typed.
- **Coverage**: 7-8 s to 2-2.4 s, same result. One pass that keeps only the columns it counts, with a pseudo-source counting the assets of each group instead of an `eventstats dc` over all of them.
- **Source detail (provenance)**: about 16% faster. The source name and time stamp are added after the key match, so only to the rows that match, and the case-insensitive `search` replaces lowercasing every row. Considered and not done: `inputlookup append=t` is slower (7.1 s against 5.0 s for three 500,000 row sources: the `append` subsearches read the lookups in parallel, and their 50,000 row limit applies to the rows that match, not to the lookup), and a `where` filter inside `inputlookup` is 25% faster but can miss rows (the merge normalizes values the raw lookup does not show, such as MAC separators and zero padded addresses; a packed multivalue column needs wildcards; `where` is case sensitive on KV store lookups).
- Run history reads use `sort N` and `where status="ok"` in the lookup; the Configure page reads sample rows with `inputlookup max=200`.

### Merge search
- The steps of the merge search that do not depend on the configuration are now macros (`adb_merge`, `adb_save_overflow`, `adb_run_guard`, `adb_record_run`, `adb_write_gate`, `adb_tag_time`, `adb_newest_first`, `adb_counters`), so the generated search is about half as long and reads as a list of steps. The default key blocklist is a macro too (`adb_key_blocklist`, `adb_key_blocklist_cs`); a customized blocklist is still written out in full. The result is the same: on a live data set the old and the new search produced identical merge results. A search saved by an earlier version keeps working and is rewritten the next time you save on the Configure page.

### Normalizers
- New normalizer *Operating system family* (macro `normalize_os_family`): maps values such as `Windows Server 2019`, `windows_10`, `Ubuntu 22.04` or `macOS Sonoma` to `Windows Server`, `Windows Desktop`, `Linux` or `Mac` (also `iOS`, `iPadOS`, `Android`, `Unix`, `Hypervisor` and `Network device`; anything else is `Other`). The existing *Operating system* normalizer (specific names such as `ubuntu` or `redhat`) is renamed in the list for clarity; it works as before.

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
