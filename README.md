# AssetDB

AssetDB merges asset records from several lookups into one asset database, without Splunk Enterprise Security. Records that share a key value (a MAC address, an IP address, a host name) become one asset, and every field is merged onto it. The result is a KV store collection you can search and use to enrich events. The app is in beta.

![Fields tab of the Configure page](docs/img/fields.png)

- [Requirements](#requirements) and [installation](#installation)
- [Quick start](#quick-start)
- [The Configure page](#the-configure-page): [Sources](#sources), [Fields](#fields), [Pipeline](#pipeline), [Settings](#settings), [Run history](#run-history)
- [How assets are merged](#how-assets-are-merged)
- [Using the asset database](#using-the-asset-database)
- [Source templates](#source-templates)
- [Operations](#operations)
- [Upgrading](#upgrading) and the [changelog](CHANGELOG.md)

## Requirements

- A Splunk Enterprise version that lets a search command choose **Python 3.13** (`python.required = 3.13` in `commands.conf`). Tested on 10.4.2, which ships both Python 3.9 and 3.13. Splunk 10.0 ignores that setting and always runs commands on its bundled Python 3.9, so it is not supported. Other versions have not been tested.
- The KV store must be running.
- An admin role to change the configuration. Everyone with read access to the app can search the asset database.

## Installation

1. Download `assetdb-<version>.tar.gz`.
2. In Splunk Web, open **Apps > Manage Apps > Install app from file**, or extract the archive into `$SPLUNK_HOME/etc/apps/`. In a search head cluster, put it on the deployer.
3. Restart Splunk if it asks you to.
4. Open **AssetDB**. The Configure page is the home page of the app.

## Quick start

1. **Add a source.** On the **Sources** tab, click *Add source* and pick a lookup. The demo lookup `assetdb_demo_assets.csv` is registered by default. To build lookups from your own data, see [Source templates](#source-templates).
2. **Add fields.** On the **Fields** tab, click *Add CIM preset* to add the common asset fields (`mac`, `ip`, `nt_host`, `dns`, `owner` and others) with sensible normalizers, or use *Add field*. Mark the fields that identify an asset as **keys**.
3. **Check the result.** On the **Pipeline** tab, click *Run preview*. It runs the whole merge without saving anything and shows how many assets would be added, removed or changed.
4. **Run it.** Click *Run now* at the top right, or leave the schedule on (daily at midnight by default).
5. **Use it.** Search `| inputlookup assetdb`, or enrich events with `` `adb_enrich(src_ip)` ``. See [Using the asset database](#using-the-asset-database).

## The Configure page

Four tabs, a status strip and a few conventions:

- **Editing is draft-and-save.** The editor beside a table holds your edits. Nothing is written until you click *Save*, and closing with unsaved edits asks first. A save writes the configuration, updates the KV store collection and regenerates the merge search; the status strip says which step failed, with a retry for that step.
- **Tables are read-only.** Each row has an *Enabled* switch (it saves on its own) and *Edit*, *Duplicate* and *Remove* icons.
- **Warning icons** beside a name explain a problem: a lookup that cannot be read, a source with no rows, or a field that no enabled source supplies. *N items need attention* in the status strip shows only those rows.
- **Help** for each setting is in the (i) tooltip beside its label.
- The **status strip** shows whether everything is saved, the last run and the next scheduled run, with *Run now* and *Run history*.

### Sources

![Sources tab with the source editor](docs/img/source-editor.png)

A source is a lookup that supplies asset records. Click *Add source* to add one; *Remove* takes it out of the merge (the lookup itself is not deleted). The editor shows the row count and columns of the chosen lookup.

| Option | What it does |
| --- | --- |
| Enabled | A disabled source is left out of the merge but keeps its settings. |
| Role | *Authoritative* sources create assets and link records that share keys. *Enrich only* sources (a vulnerability scanner, a firewall log) never create or link assets. A row is attached only when its keys match exactly one asset, otherwise it is dropped and counted. |
| Max row age | Ignore rows older than this. Rows without a time are kept. |
| Row filter | A `where` expression on the source's columns, for example `status!="decommissioned"`. Splunk validates it when you save. |
| Scope | The site or tenant of every row in this source. See [Scoped keys](#scoped-keys). |
| Time column | The column with each row's epoch time, if it is not `_time`. |
| Field mapping | Maps a lookup column to an asset field when the names differ, for example `Computer Name` to `nt_host`. |

### Fields

![Field editor with a tooltip](docs/img/field-editor.png)

A field is something you want on the asset. *Add CIM preset* adds the missing CIM-shaped fields in one step: `mac`, `ip`, `nt_host` and `dns` (keys), `owner`, `priority`, `bunit`, `category`, `city`, `country`, `pci_domain` and `is_expected`. It uses only the names and defaults, and needs neither the CIM add-on nor Enterprise Security. Existing fields are left alone.

Every merged asset also gets `source`, `source_lookup`, `last_seen` (the latest `_time` of its rows), `scope` and `conflicts`. The names `_key`, `asset`, `source`, `source_lookup`, `last_seen`, `scope` and `conflicts` are reserved.

| Property | What it does |
| --- | --- |
| Name | Letters, digits and underscores, starting with a letter or underscore. Cannot be changed later. |
| Description | Documents the field. It does not affect the merge. |
| Enabled | A disabled field is left out of the merge but keeps its settings. |
| Key field | Records with the same value in a key field are merged into one asset. Each key field gets an index in the collection; the KV store allows 10 per collection and `asset` uses one, so at most 9 key fields are indexed. |
| Key scope | *Global* keys match everywhere. *Scoped* keys match only within the same scope. |
| Field type | *Single* keeps one value per asset. *Multivalue* keeps every unique value. |
| Method | (Single) which value wins when sources disagree: *Latest* or *Earliest* by the row's `_time`, *Min*, *Max*, *Average* or *Sum* for numbers (set Value type to Number), or *Coalesce*, the first non-empty value in the *Source order* you give. |
| Case sensitive | When off, values match regardless of case and are lowercased. |
| Keep original case | (Key fields, case-insensitive) stores the value as written and lowercases only for matching. Not available with the host name, FQDN, user name, email and operating system normalizers, which lowercase the value. |
| Normalizer | Puts values in a standard form first: trim, MAC (`aa:bb:cc:dd:ee:ff`), IP (no leading zeros), short host name, FQDN, user name (strips `DOMAIN\` and `@domain`), email, operating system family. *Default* uses the setting on the Settings tab. |
| Validate as | Drops values that are not of the type (IP, IPv4, IPv6, MAC, email, host name, FQDN, CIDR, whole number, number) after normalizing. The asset stays; only the value goes. |
| Ignore values | Values to skip: an exact value, `re:<regex>` or `cidr:<network>`, for example `unknown`, `re:^169\.254\.`, `cidr:127.0.0.0/8`. |
| Use the global ignore list | Also skip the values on the global list (Settings). On by default. |
| Validation pattern | A regular expression; values that do not match are dropped. |
| Eval expression | An SPL `eval` expression applied before merging. Pipes, backticks and brackets are allowed only inside quoted strings. |
| Fill null | A fixed value for assets with no value in any source. Applied after the merge. Not allowed on key fields. |
| Value type | The type of the field in the KV store collection: text, number, true/false, time or CIDR. |
| Flag conflicts | When sources disagree, adds the field name to the asset's `conflicts` field. Uses more memory. |
| Max values, Value order | (Multivalue) the most values kept (1 to 100), and which: *Most recent first* or *Alphabetical*. |
| Only accept values from | Take values for this field only from the listed sources. |

![Add CIM preset dialog](docs/img/cim-dialog.png)

### Pipeline

![Pipeline tab: preview and merge search](docs/img/pipeline.png)

The Pipeline tab has two parts.

**Preview.** *Run preview* runs the whole merge without saving and compares it with the current asset database: assets that would be *added*, *removed* or *changed* (a change to a value inside an asset counts), assets *unchanged*, and the merge counters. It says so when the safety check would block a real run. The comparison is a normal search job: *Open in Search* opens it, one row per asset (`change`, `asset`, `changed_fields`). It does the same work as a real run apart from the writes, so it can take a while with many assets. In the screenshot every asset shows as changed because the existing asset database was built without these fields.

**Merge search.** The search that the schedule and *Run now* run, generated from your sources, fields and settings and shown one stage at a time, in the order they run. It is regenerated on every save. To change how merging works, change the configuration, not the saved search `assetdb-lookupgen`, which would be overwritten.

### Settings

![Settings tab](docs/img/settings.png)

| Setting | What it does |
| --- | --- |
| Max keys per asset | The most keys one asset may have (default 25, hard limit 100). Larger groups are not written; they are listed under Oversized clusters. They are usually caused by a shared key such as a NAT address. |
| Max rows per key | A key found in more rows than this (default 50, 0 turns it off) is not used for matching. Catches shared keys the blocklist misses. |
| Minimum size vs last run | A run that produces fewer assets than this share (default 50%) of the last successful run is not saved and shows as Blocked. A run with no assets never overwrites the asset database. |
| Run on a schedule, Cron schedule | When the merge runs (default `0 0 * * *`). |
| Runs to keep | How many runs the history keeps (default 200, at most 5000). |
| Default case sensitive, Default normalizer | Used by fields that do not set their own. |
| Scope column | A column in the source lookups with each row's scope, for sources that have no scope of their own. |
| Key blocklist | Values never used for matching in any key field. The defaults cover all-zero and broadcast MACs, `0.0.0.0`, `::`, loopback and link-local addresses, `localhost` and placeholders such as `unknown` and `n/a`. A blocked value stays on the asset; it just cannot link two assets. Saving replaces the defaults, so you can remove any of them. |
| Global ignore list | Values skipped in every field that uses the global list. |

### Run history

![Run history panel](docs/img/run-history.png)

Every run writes one record to the `assetdb_runs` collection: time, status (`ok`, `blocked_low_count` or `empty`), assets produced, rows read, rows without a key, oversized clusters, shared keys skipped and unmatched or ambiguous enrich rows. The *Run history* panel shows the latest runs and the oversized clusters of the last run (the `assetdb_overflow` collection, replaced on every run). Search them directly:

```
| inputlookup assetdb_runs | sort 0 -run_time
| inputlookup assetdb_overflow
| inputlookup assetdb | search conflicts=*
```

The disabled saved search `assetdb-run-alert` returns the latest run when it was not `ok`. Enable it and attach an alert action to be told about a blocked run. A KV collection is used for the history, and not an index, because the merge reads it back and it must work where an app cannot create an index.

## How assets are merged

AssetDB treats records that share a key value as the same asset. Say one laptop appears in three systems, and each knows something different. `mac` and `nt_host` are key fields; `ip` is a multivalue field and `owner` a single-value field:

| Source | mac | nt_host | ip | owner |
| --- | --- | --- | --- | --- |
| cmdb | aa:bb:cc:00:00:01 | LAPTOP-7 | | dana |
| dhcp | aa:bb:cc:00:00:01 | | 10.1.1.20 | |
| edr | | laptop-7 | 10.1.1.31 | |
| cmdb | aa:bb:cc:00:00:02 | SRV-DB | | ops |

1. The `cmdb` row and the `dhcp` row share the MAC address, so they are the same asset.
2. The `edr` row shares the host name with the `cmdb` row (case is ignored), so it joins too. It has nothing in common with the `dhcp` row, but both match the `cmdb` row.
3. The last row shares nothing with the others, so it is a separate asset.

The result is two assets, each with one value per field, or all unique values for a multivalue field:

| mac | nt_host | ip | owner |
| --- | --- | --- | --- |
| aa:bb:cc:00:00:01 | laptop-7 | 10.1.1.20, 10.1.1.31 | dana |
| aa:bb:cc:00:00:02 | srv-db | | ops |

Linking is chained: a row joins an asset if it shares a key with any row already in it. That is why one bad key, such as a shared NAT address, can pull unrelated assets together, and why [key quality](#key-quality) matters. When sources disagree on a single-value field, the field's *Method* decides which value wins (the latest, by default).

Every key value of an asset (`aa:bb:cc:00:00:01` and `laptop-7` above) is stored in the multivalue `asset` field of the collection, which is indexed, so looking up an asset by any key is a plain KV lookup.

### Scoped keys

The same address in two sites (overlapping private ranges, an acquired network, one tenant per customer) must not merge. Give each source a **Scope** (or set a **Scope column** in Settings), then mark the key fields that are only unique within a site, such as IP addresses and host names, as **Scoped**. Leave globally unique ones, such as MAC addresses and serial numbers, as **Global**. A scoped key becomes `<scope>|<value>`, so it matches only rows of the same scope. Turning scoping on changes the keys, so the first run after it rebuilds the collection.

### Key quality

One bad key can chain unrelated assets into one huge cluster. Three protections are on by default: the **key blocklist**, **Max rows per key** and **Max keys per asset** (see Settings). Rows left without any key are dropped and counted.

## Using the asset database

Read it with `| inputlookup assetdb`. It returns every asset (tested with 150,000). A subsearch does not: `append [| inputlookup assetdb]` silently stops at 50,000 results, so use `| inputlookup append=true assetdb` instead.

Enrich events with a macro (they are exported to all apps):

```
index=firewall | `adb_enrich(src_ip)`
index=dhcp | `adb_enrich_mac(client_mac)`
index=vpn | `adb_enrich_scoped(src_ip, site)`
```

| Macro | What it does |
| --- | --- |
| `adb_enrich(key)` | Looks up the value of `key` (lowercased) against the keys of every asset and adds `asset_id`, `asset_source`, `asset_source_lookup`, `asset_last_seen` and `asset_<field>` for each configured field. Fields already on the event are not overwritten. |
| `adb_enrich_mac(key)`, `adb_enrich_ip(key)`, `adb_enrich_host(key)` | The same after normalizing the value like the MAC, IP or short host name normalizer, so `AABB.CCDD.EEFF` finds `aa:bb:cc:dd:ee:ff`. The original field is unchanged. |
| `adb_enrich_scoped(key, scope)` | For keys marked *Scoped*: looks up `<scope>|<value>`. |
| `adb_enrich_with(key, lookup)` | The building block, for a lookup other than `assetdb`. |

The columns come from the `adb_enrich_outputs` macro, which the Configure page keeps in line with the configured fields. Matching is lowercase, so keys of case-sensitive fields match only when they are already lowercase.

Other macros: `input_adb_lookup(lookup)` reads a source lookup and sets `source_lookup`; `output_adb_lookup(lookup)` writes one; `normalize_trim`, `normalize_mac`, `normalize_ip`, `normalize_hostname`, `normalize_fqdn`, `normalize_user`, `normalize_email` and `normalize_os` are the normalizer presets, safe for multivalue fields.

## Source templates

Building the source lookups is the hardest part of setup. The app ships seven **disabled** saved searches that build a source lookup in the field names the CIM presets use. Enable one, run it once (it creates the lookup file), then add that lookup on the Sources tab. Adapt the search to your data.

| Saved search | Source | Needs | Add as |
| --- | --- | --- | --- |
| `assetdb-src-splunk-hosts` | every host that sends data to Splunk (`| metadata type=hosts`) | nothing | Authoritative (host name only) |
| `assetdb-src-dhcp-cim` | IP, MAC and host name from DHCP events (CIM Network Sessions) | CIM add-on and a DHCP add-on | Authoritative, with a short max age |
| `assetdb-src-vulnerabilities-cim` | vulnerability counts and highest CVSS per host (CIM Vulnerabilities) | CIM add-on and a scanner add-on | **Enrich only** |
| `assetdb-src-ad-computers` | enabled Active Directory computer accounts | SA-LDAPSearch (adapt the domain; not tested here) | Authoritative |
| `assetdb-src-crowdstrike-devices` | hosts from CrowdStrike Falcon (internal IP only; the Falcon device ID is the key) | CrowdStrike Falcon Devices Technical Add-on (not tested here) | Authoritative |
| `assetdb-src-defender-machines` | devices from Microsoft Defender for Endpoint | Splunk Add-on for Microsoft Security (not tested here) | Authoritative |
| `assetdb-src-tenable-assets` | assets from Tenable Vulnerability Management | Tenable Add-On for Splunk (not tested here) | Authoritative, or Enrich only if another source owns the inventory |

Only the first needs no add-on and is tested end to end. The CIM ones are checked as far as the data model lookup. The others are starting points to adapt.

## Operations

- **Rewrite window.** The merge search ends with `outputlookup`, which replaces the collection. Measured on Splunk 10.4.2 with 45,000 assets rewritten in about 2 seconds while six readers polled it, roughly 1 in 70 reads returned no results during the rewrite. Searches that use `| lookup assetdb` during the scheduled run can miss matches briefly, so schedule the merge outside the hours that matter.
- **Search head clusters.** `default/server.conf` replicates `assetdb.conf`, so configuration saved on one member reaches the others. The merge is a scheduled search and runs on one member. The collections are shared by the cluster.
- **Memory.** `adbmerge` keeps every key set in memory, which is why Max keys per asset has a hard limit of 100.
- **Permissions.** Only admins can write the app's configuration, collections and the merge search. Read access follows the app; restrict it in Splunk Web under Permissions if the asset data is sensitive.

## Upgrading

Upgrading from 1.5.7 or earlier changes behavior. Read the **Breaking changes** in the [changelog](CHANGELOG.md) first. The merge search is rewritten the first time you save anything on the Configure page (change a setting and save, for example); until then scheduled runs keep using the old search. Run *Run preview* on the Pipeline tab before the next scheduled run to see what will change.

## Development

Unit tests, packaging, AppInspect, deployment to a dev server, integration and UI tests are described in [docs/TESTING.md](docs/TESTING.md). Quick start: `make test`, `make package`, `make inspect`. The screenshots in `docs/img/` are generated by `tests/e2e/screenshots.mjs`.
