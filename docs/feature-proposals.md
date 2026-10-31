# AssetDB feature proposals

Status: proposal only, nothing here is implemented. Written against the code as of commit `1522af9`.

## Where AssetDB stands today

AssetDB is a small, opinionated merge engine:

- Source lookups (CSV or KV) are read with `input_adb_lookup`. Rows are normalised per field (split, lowercase, validate, ignore, fill null, eval), and a key is built from the key fields.
- `adbmerge` clusters rows that share any key, transitively (union-find in `bin/adbmerge_core.py`). Clusters larger than `max_keys` are dropped.
- The generated search (`makeMergeSearchLines()` in `assetdb.js`) aggregates fields with per-field merge methods. It writes one record per cluster to the `assetdb` KV collection, keyed by `md5(sorted keys)`, with `asset`, `source`, `source_lookup` and `last_seen`.
- Everything is configured from one Simple XML page. Nothing depends on Splunk Enterprise Security (ES), CIM or any add-on.

**What it does not do.**

- It produces a table but gives users no help consuming it.
- It does not protect against bad keys.
- It cannot tell you whether the last run was healthy.
- An asset's identity (`_key`) changes whenever its key set changes.
- It only knows about assets, not people.

The proposals below target those gaps. They are grouped by theme and numbered for cross-references.

**Positioning rule used throughout.** A feature is fine if it runs on plain Splunk Enterprise/Cloud with only this app. It is acceptable if it *optionally* uses free Splunkbase add-ons (CIM, TAs). It **breaks the "no ES required" positioning** if it reads or writes ES objects: the `assets_by_str`/`identities_by_str` collections, `asset_lookup_by_str`, notables, the risk framework, or the Assets & Identities framework. Those are flagged ⚠️ ES.

---

## A. Make the data usable

### P1. Enrichment macros: "look up any key"

- **Problem.** Analysts have an IP, MAC or hostname from an event and want the merged asset. Today they must know to write `| lookup assetdb asset AS src OUTPUT ...`. They must also know that `asset` is multivalue and holds lowercase keys from several fields. Nobody does this, so the data goes unused.
- **Design.**
  - Add to `macros.conf`:
    - `adb_enrich(1)`: `field` → all asset fields, prefixed `<field>_`.
    - `adb_enrich(2)`: field plus an explicit output list.
    - `adb_enrich_multi(n)`: tries `src`, `dest`, `dvc`, ... and coalesces.
  - Each macro lowercases the input field when key fields are case-insensitive, then runs `lookup assetdb asset AS <field> OUTPUT ...`. This matches any element of the multivalue `asset` field and uses the existing `accelerated_fields.asset`.
  - Export the macros (`export = system` in `default.meta`) so other apps can call them.
  - Document in the README with three copy-paste examples.
- **Effort:** S. **Risk:** low. The only subtlety is case: the macro must apply the same lowercasing as the key fields, so derive it from config or always lowercase.
- **Dependencies:** none. **ES:** none.

### P2. Optional automatic lookups

- **Problem.** Even with P1, analysts have to remember to enrich. ES users get asset fields on every event "for free", and that is a main reason people buy ES.
- **Design.**
  - Add a "Automatic enrichment" tab in the UI where an admin picks sourcetypes or source fields (e.g. `sourcetype=pan:traffic`, fields `src_ip`, `dest_ip`). The UI writes `props.conf` stanzas (`LOOKUP-assetdb_src = assetdb asset AS src_ip OUTPUTNEW priority AS src_priority ...`) through `conf-props`, under `local/`.
  - Ship disabled, with no default stanzas.
- **Effort:** M. **Risk:** medium.
  - Search-time cost on busy sourcetypes, since every event does a KV lookup.
  - Matching depends on the lookup's case rules.
  - The UI has to write `props.conf` safely, with the same validation and escaping lessons as F-03.
- **Dependencies:** P1, for the field-naming conventions. **ES:** none. This is the feature that makes "no ES required" credible.

### P3. Asset Explorer dashboard

- **Problem.** "What do we know about 10.1.2.3?" has no answer in the app. Today it is a Configure page and nothing else.
- **Design.**
  - Add a new view `explore.xml`.
  - A text input takes any key, and a search resolves it through `assetdb`.
  - The view shows the merged record and its keys (`asset`). It shows which source lookups contributed, with the raw source rows from each lookup filtered by the keys. It also shows `last_seen` and a link to "events mentioning any of these keys" (an `index=* (key1 OR key2 ...)` drilldown, time-bounded).
  - Add the view to `nav/default.xml` and make it the default view once there is data.
- **Effort:** M. **Risk:** low. Simple XML only, no new JS required.
- **Dependencies:** P1, which it uses for lookups. **ES:** none.

### P4. Control-coverage gaps

- **Problem.** The most valuable question asset inventories answer for security is "which assets are missing my EDR / vuln scanner / log forwarder?". AssetDB already knows which sources each asset came from (`source`), but nothing asks the question.
- **Design.**
  - Each lookup in `[general] lookups` gets a `role` tag in the UI: `inventory` (CMDB, AD, DHCP) or `control` (EDR, scanner, MDM).
  - Add a dashboard panel and a saved search `assetdb-coverage-gaps`: assets present in at least one inventory source but absent from a given control source. This is pure SPL over `source`.
  - The generator needs no change, because `source` is already in the output.
- **Effort:** S–M. **Risk:** low.
- **Dependencies:** none. P3 is a nice place to show it. **ES:** none.

### P5. Unknown-asset detection

- **Problem.** Hosts that appear in traffic or auth logs but are not in any inventory are the ones that matter. That includes shadow IT, new VMs and attacker infrastructure inside the network.
- **Design.**
  - Ship a disabled saved-search template `assetdb-unknown-assets`. It takes a configurable base search and field, for example `tstats` over CIM Network_Traffic if available, else a raw search. It runs `adb_enrich` and keeps rows with no match.
  - A small summary KV collection `assetdb_unknown` holds first/last seen and count, so the list is reviewable and not just an alert.
  - Optionally, the dashboard offers an "add as source row" action that writes to a `manual_assets.csv` source lookup.
- **Effort:** M. **Risk:** low-medium. False positives come from external IPs, so default the filter to RFC1918 plus a configurable CIDR list.
- **Dependencies:** P1. **ES:** none. Using CIM data models is optional.

---

## B. Make the merge trustworthy

### P6. Key-quality protection: junk and over-shared keys ⭐

- **Problem.** This is the biggest correctness risk in the product. Transitive merging means one bad key collapses unrelated assets into one record. Examples are `00:00:00:00:00:00`, a NAT/VPN/proxy IP, `localhost`, `unknown`, or a golden-image hostname.
  - `ignore_values` exists, but it is per field, and you only add values after noticing the damage.
  - The damage is invisible: the merged cluster just quietly gets bigger. Clusters over `max_keys` are dropped and you lose the asset entirely.
- **Design.**
  - **Global key blocklist** in `[general]`: values and regexes, editable in the UI, and applied in the generator before the `_key` eval. It ships with sensible defaults: all-zero/broadcast MACs, `127.0.0.0/8`, `0.0.0.0`, `::1`, `localhost`, `unknown`, `none`, `n/a`.
  - **Frequency guard** in `adbmerge`: new option `max_key_share=<n>` (default e.g. 50). A key that appears in more than *n* input rows from *different* first keys is treated as non-identifying. It is removed from all rows before clustering, and the command reports it.
    - This goes in `adbmerge_core.py` as a pre-pass: count `key → distinct rows`, then drop.
    - It is cheap and deterministic, and it catches NAT IPs and image hostnames automatically.
  - Report removed keys in the run summary (P8) and in the Overflow/Conflicts view (P9).
- **Effort:** M. Python and generator work, unit tests are straightforward. **Risk:** medium. A too-low threshold splits real assets. Default high and surface the numbers.
- **Dependencies:** none. P8 and P9 make it observable. **ES:** none.

### P7. Site/tenant-scoped keys

- **Problem.**
  - Overlapping RFC1918 space across sites, M&A networks, or MSSP customers makes `10.0.0.5` in Paris and `10.0.0.5` in Dallas merge into one asset.
  - Hostnames collide across AD forests.
- **Design.**
  - Add a field property `scope_field` (or a global `[general] scope_field`, e.g. `site`, `tenant`). When it is set, the generator prefixes non-global keys with the scope value: `_key = site . "|" . ip`.
  - Mark some key fields as global (MAC, serial number, cloud instance ID) so they still link across scopes.
  - Add `scope` to the output, and make `adb_enrich` (P1) accept a scope argument.
- **Effort:** M. **Risk:** medium.
  - Prefixing changes every `_key`, so the first run after enabling it rebuilds the collection. P10 softens that.
  - The UI needs a per-field "global key" toggle.
- **Dependencies:** none. It works better with P10. **ES:** none.

### P8. Run health and history

- **Problem.**
  - Nobody knows whether last night's merge worked.
  - `adbmerge` logs counts to `python.log` at INFO/WARN, but nothing reads them.
  - A broken source lookup, for example an upstream search that failed and wrote an empty CSV, silently shrinks the inventory. The table is replaced wholesale (F-21).
- **Design.**
  - `adbmerge` emits its counters as a search message. A final `| appendpipe` in the generated search writes one row per run to a new KV collection `assetdb_runs` with:
    - time, duration and rows in
    - assets out
    - null-key rows, overflow clusters, keys removed by P6
    - rows per source lookup
  - A "Health" panel on the Configure page or Explorer shows the last 30 runs.
  - A shipped, disabled alert `assetdb-run-anomaly` fires when assets out drop more than X% versus the 7-run median, or when a source contributes 0 rows.
  - **Safety switch:** a `[general] min_ratio` setting (e.g. 0.7). It makes the generated search refuse to `outputlookup` when the new asset count is below 70% of the previous run, leaving the old table in place. This needs an `eval`/`where` guard before `outputlookup`, which is easy in SPL.
- **Effort:** M. **Risk:** low.
- **Dependencies:** none. Most other proposals report into this. **ES:** none.

### P9. Overflow and conflict review

- **Problem.**
  - Clusters over `max_keys` are dropped with only a count. Those are often the most interesting assets, or the symptom of a bad key, and you can't see which ones they were.
  - For single-value fields, conflicting values across sources (two owners, two business units) are resolved silently by the merge method.
- **Design.**
  - `adbmerge` gets `overflow=keep|drop|emit`. With `emit`, dropped clusters go out as rows tagged `adb_status=overflow`, carrying their keys and top contributing keys. The generator splits them into a separate KV collection `assetdb_overflow`; they are not written to `assetdb`.
  - For conflicts, the final stats additionally computes `dc(<field>)` for single-value fields and writes `conflicts` (the field names with more than one value) to the record.
  - A "Review" view lists overflow clusters with "add key to blocklist" (P6) and "raise max_keys" actions, plus records with conflicts.
- **Effort:** M. **Risk:** low.
- **Dependencies:** P6 for the actions. P8 for counts. **ES:** none.

### P10. Stable asset IDs across runs ⭐

- **Problem.**
  - `_key = md5(sorted keys)`. When an asset gains an IP, loses a MAC, or merges with another, its `_key` changes. Anything that referenced the old key now points at nothing: notes, tickets, an exception list, P13 history, or a SOAR playbook.
  - For an inventory that changes daily (DHCP), that is most assets.
- **Design.**
  - Before writing, the generated search reads the previous `assetdb` (`inputlookup assetdb`) and maps each previous `asset_id` to its key set. Each new cluster inherits the `asset_id` of the previous record it shares the most keys with, ties broken by oldest. Otherwise it gets a new UUID-like ID.
  - Merges keep the older ID and record the absorbed IDs in `merged_ids`. Splits give the larger child the old ID.
  - This matching is best done in the custom command. Add an `adbmerge previous=<lookup>` option, or a second small command `adbcarry`. In SPL it would be painful.
  - `_key` becomes `asset_id`, and `asset` stays the multivalue key set.
- **Effort:** L. **Risk:** medium-high.
  - Reading the previous table hits the 50k `max_rows_per_query` cap (README "Read limit"). The command should read the collection over REST in pages, or the cap must be raised.
  - Matching rules need care and good tests.
  - It is a breaking change for anyone joining on the md5 `_key`, so ship it behind a flag.
- **Dependencies:** none. It enables P11 and P13. **ES:** none.

### P11. Remove the rewrite window (double-buffered collection)

- **Problem.** F-21 measured on 10.4.2: about 1 in 70 reads during a rewrite returns nothing. With P2 (automatic lookups) that becomes a real gap in enrichment at run time.
- **Design.**
  - Use two collections `assetdb_a`/`assetdb_b`. The run writes to the inactive one, verifies the count (P8's safety switch), then flips the `assetdb` lookup definition's `collection` through `conf-transforms`.
  - The `assetdb` lookup name stays stable for consumers.
- **Effort:** M. **Risk:** medium.
  - Flipping a transform needs the right ACLs.
  - Search-head clusters replicate the transform change with a delay.
  - It needs a small scripted step or a modular alert action, because SPL cannot edit conf. A tiny custom command `adbswap` is cleanest.
- **Dependencies:** P8, for the "only swap when healthy" check. **ES:** none.

### P12. Search-head cluster readiness

- **Problem.** The UI writes `assetdb.conf`, which is not replicated in a search-head cluster (AppInspect `check_custom_conf_replication`). On an SHC the config silently diverges between members.
- **Design.**
  - Add `default/server.conf` `[shclustering] conf_replication_include.assetdb = true`.
  - Document the deployer workflow.
  - Test that the saved search runs on the captain only, which is the default for scheduled searches.
- **Effort:** S. **Risk:** low.
- **Dependencies:** none. **ES:** none.

---

## C. Make it an asset *and identity* layer

### P13. Change history and asset timeline

- **Problem.** "When did this host get this IP?" and "what changed in the inventory last night?" are basic IR and audit questions. AssetDB keeps only the current state.
- **Design.**
  - After the merge, diff the new table against the previous one by `asset_id` (P10). Write change events (`asset_added`, `asset_removed`, `field_changed` with old/new, `asset_merged`) to a summary index `assetdb_changes` with `collect`.
  - The app ships an `indexes.conf` stanza, disabled by default so the admin creates or chooses the index.
  - P3 shows a timeline.
- **Effort:** M. **Risk:** low-medium. Index creation and retention are admin decisions, and `collect` uses license only for `sourcetype=stash`, which is free.
- **Dependencies:** P10. Without stable IDs, every key change looks like delete plus add. **ES:** none.

### P14. Identities: a second entity type ⭐

- **Problem.** Security teams correlate *people* as much as hosts: `jdoe`, `jdoe@corp.com`, `CORP\jdoe` and employee ID 4711 are one person. Identity correlation is the other half of ES's Assets & Identities, and nothing free does it well.
- **Design.**
  - Generalise "the" database into entity types.
    - In `assetdb.conf`, stanzas become namespaced: `[entity:assets]`, `[entity:assets/field:mac]`, `[entity:identities]`, .... A migration step maps today's flat stanzas into `assets`.
    - Each entity type gets its own collection (`assetdb`, `identitydb`), lookup, saved search and `max_keys`.
  - The generator and `adbmerge` are already entity-agnostic. The changes are:
    - parameterising the output name and saved search name in `makeMergeSearchLines()`
    - a type switcher in the UI
    - default identity fields: user, email, upn, sid, employee_id, manager, department, start/end date
  - Add a `normalize_user` macro: strip domain or UPN suffix, lowercase.
- **Effort:** L. It touches config layout, UI navigation, ACLs and migration. **Risk:** medium.
  - The config migration must be bulletproof.
  - Lookups that consumers already use must keep working, so `assetdb` stays as is.
- **Dependencies:** P1 (an `idb_enrich` twin). It works well with P10. **ES:** none.

### P15. Asset–identity links

- **Problem.** "Whose laptop is this?" and "what machines does this user log into?" Owner fields exist in sources, but they don't link to an identity record.
- **Design.**
  - Add an optional field property `links_to = identities.user`. In the generator, the linked field is normalised with the identity normaliser and stored as `owner_identity_id`.
  - Optionally, a saved search computes "observed" links from auth logs (CIM Authentication if present): the top user per host over 7 days goes into `observed_owner`.
- **Effort:** M. **Risk:** medium. "Observed" ownership is noisy, so keep it separate from the declared owner.
- **Dependencies:** P14 (hard). **ES:** none. Authentication data model usage is optional.

---

## D. Make onboarding fast

### P16. Source templates

- **Problem.** The README tells users to "create lookup files and corresponding lookup generation searches for each unique data source". That is the hardest step, and the app gives no help.
- **Design.**
  - Ship disabled saved searches that each produce a well-formed source lookup through `output_adb_lookup`, for common sources:
    - Windows/AD from `ldapsearch` (SA-LDAPSearch) or the AD TA's `WinHostMon`
    - DHCP (Windows, ISC)
    - Microsoft Defender/CrowdStrike device APIs from their TAs
    - AWS/Azure instance inventory (Splunk Add-on for AWS/Azure)
    - vulnerability scanners (Tenable, Qualys)
    - a generic CMDB CSV
  - Each template uses `normalize_mac`, `normalize_os` and `host_from_dns`, and documents the TA it needs.
  - The "Add Lookup" modal lists enabled template outputs first.
- **Effort:** M. Mostly SPL and docs, but each template needs real sample data to test. **Risk:** low.
  - Templates rot as TAs change field names. Keep them few, versioned, and covered by golden SPL tests the way the generator is.
- **Dependencies:** none. **ES:** none. TAs are free Splunkbase add-ons and none are required by the core app.

### P17. Merge preview and dry run in the UI

- **Problem.** Changing a key field or merge method is a blind edit: you only find out after the nightly run that it collapsed half the inventory.
- **Design.**
  - Add a "Preview" button on the Merge Search tab. It runs the generated search with the final `outputlookup` replaced by stats: assets out, overflow, null keys, top-10 largest clusters, and the per-source contribution. It compares the result with the current `assetdb`.
  - The UI shows a diff summary before the user saves.
  - Reuse `makeMergeSearchLines()`: drop the last line and append a stats tail.
- **Effort:** M. **Risk:** low. Preview runs can be expensive on big inventories, so add `| head` / sampling options.
- **Dependencies:** none. It is better with P8's counters. **ES:** none.

### P18. Config export/import

- **Problem.** Promoting a tuned configuration from dev to prod means re-clicking every field.
- **Design.**
  - Add buttons to download `assetdb.conf` fields and lookups as JSON, and to upload and apply them. The upload goes through the same validation as the UI (`FIELD_NAME_RE`, `checkEvalExpression`, ...) and is applied with `finishChange`.
  - Alternatively, document that `local/assetdb.conf` can be copied, which is simpler but less safe.
- **Effort:** S. **Risk:** low. Validation must be the same code path as the UI, which already exists.
- **Dependencies:** none. P14 changes the schema, so version the JSON. **ES:** none.

### P19. Common Information Model (CIM) field presets

- **Problem.** Users invent field names (`hostname`, `host_name`, `nt_host`), so enrichment output doesn't line up with CIM-based content.
- **Design.**
  - In the Add Field modal, offer a "Use CIM asset preset" button that pre-creates `ip`, `mac`, `nt_host`, `dns`, `owner`, `priority`, `bunit`, `category`, `pci_domain`, `is_expected` with sensible merge methods and key flags.
  - These are just names and defaults, not a dependency.
- **Effort:** S. **Risk:** low.
- **Dependencies:** none. **ES:** none. It is CIM-*shaped*, which also eases P20.

### P20. ES-compatible export ⚠️ ES (only if done the wrong way)

- **Problem.** Some teams later adopt ES, or run ES in one place and plain Splunk in another, and want AssetDB as the feed.
- **Design.**
  - Add a disabled saved search `assetdb-export-es` that writes a CSV `assetdb_es_assets.csv` in ES's asset lookup *schema*: multivalue as `|`, with `ip`, `mac`, `nt_host`, `dns`, `owner`, `priority`, ... (pairs with P19). ES admins register it as an asset source in ES themselves.
  - **Do not** write into ES's collections or reference ES objects.
- **Effort:** S. **Risk:** low as an export. ⚠️ Writing directly into `assets_by_str`, or depending on ES macros, would break the positioning and couple the app to ES versions.
- **Dependencies:** P19. **ES:** export only. It must stay optional and out of the core path.

---

## E. Things I would not do (yet)

- **Incremental merge** (merge only changed source rows). The full rewrite of a few hundred thousand rows takes seconds (measured about 2s per 45k on the dev box). Incremental clustering with transitive merges and deletions is hard to get right. Revisit only if P8 shows runs over about 10 minutes.
- **Risk scoring and notables inside AssetDB.** That is ES territory ⚠️ ES. Expose `priority` and `bunit` for others to use instead.
- **A React/Dashboard Studio rewrite of the UI.** The Simple XML page works, is tested end to end (`scripts/e2e.sh --flow`), and isn't what limits adoption.
- **Weak, time-bounded keys** (an IP links only within a DHCP lease window). It is real but complex. P6's frequency guard plus P7 scoping cover most of the damage at a fraction of the cost.

---

## Summary

| # | Proposal | Effort | Risk | Depends on | ES flag |
| --- | --- | --- | --- | --- | --- |
| P1 | Enrichment macros | S | Low | — | — |
| P2 | Optional automatic lookups | M | Med | P1 | — |
| P3 | Asset Explorer dashboard | M | Low | P1 | — |
| P4 | Control-coverage gaps | S–M | Low | — | — |
| P5 | Unknown-asset detection | M | Low–Med | P1 | — |
| P6 | Key-quality protection | M | Med | — | — |
| P7 | Site/tenant-scoped keys | M | Med | (P10) | — |
| P8 | Run health, history, safety switch | M | Low | — | — |
| P9 | Overflow and conflict review | M | Low | P6, P8 | — |
| P10 | Stable asset IDs | L | Med–High | — | — |
| P11 | Double-buffered collection | M | Med | P8 | — |
| P12 | SHC readiness | S | Low | — | — |
| P13 | Change history | M | Low–Med | P10 | — |
| P14 | Identities entity type | L | Med | P1 | — |
| P15 | Asset–identity links | M | Med | P14 | — |
| P16 | Source templates | M | Low | — | — |
| P17 | Merge preview / dry run | M | Low | (P8) | — |
| P18 | Config export/import | S | Low | — | — |
| P19 | CIM field presets | S | Low | — | — |
| P20 | ES-compatible export | S | Low | P19 | ⚠️ only if it writes into ES |

## Top 10 by value-to-effort

1. **P1 Enrichment macros (S).** Turns a table nobody queries into something every analyst can use in one line. Highest ratio in the list.
2. **P6 Key-quality protection (M).** Prevents the silent mega-merges that would make people stop trusting the data, the failure mode most likely to kill adoption.
3. **P8 Run health and safety switch (M).** A bad upstream CSV currently wipes the inventory unnoticed. Cheap insurance that every later feature reports into.
4. **P4 Control-coverage gaps (S–M).** The most direct security payoff ("which assets lack EDR?") from data the app already has.
5. **P12 SHC readiness (S).** A small fix for a real correctness problem in clustered deployments.
6. **P19 CIM field presets (S).** Removes naming bikesheds and makes P1, P2 and P20 output line up with existing content.
7. **P17 Merge preview (M).** Makes config changes safe, which matters more as P6 and P7 add knobs.
8. **P3 Asset Explorer (M).** The "front door" of the app. Cheap once P1 exists.
9. **P10 Stable asset IDs (L).** Expensive, but it is the foundation for history, references and identities. Without it AssetDB stays a nightly snapshot.
10. **P5 Unknown-asset detection (M).** A compelling security use case, nearly free once P1 exists.

Next tier: P2 (high value, but do it after P1/P8 so the performance and health story is in place), P14 (biggest strategic step, L), P7, P16, P9, P13, P11, P18, P15. Keep P20 at the bottom and export-only.

**Suggested sequencing.**

1. P1 + P19 + P12 (one small release).
2. P6 + P8, released together, since P8 reports P6's removals.
3. P4 + P3 + P17.
4. P10, then P13 and P14 build on it.
