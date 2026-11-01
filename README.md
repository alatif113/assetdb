# AssetDB

AssetDB combines asset records from several lookups into one list of assets. Records that share an identifier, such as a MAC address, an IP address or a host name, become one asset, and their fields are merged. You can search the result and use it to add asset details to your events. It does not need Splunk Enterprise Security.

![The Fields tab of the Configure page](docs/img/fields.png)

## Requirements

- Splunk Enterprise 10.2 or later.
- The KV store must be running.
- To change the configuration you need the `admin` role. Anyone who can read the app can search the asset list.

## Installation

1. In Splunk Web, open **Apps > Manage Apps > Install app from file** and upload `assetdb-<version>.tar.gz`. Or extract it into `$SPLUNK_HOME/etc/apps/`. In a search head cluster, install it from the deployer.
2. Restart Splunk if asked.
3. Open **AssetDB**. The Configure page is the home page of the app.

Upgrading? Read the breaking changes in the [changelog](CHANGELOG.md) first. The merge search is updated the first time you save something on the Configure page. Until then, scheduled runs use the old one.

## Quick start

1. **Add a source.** On the **Sources** tab, click *Add source* and choose a lookup. The demo lookup `assetdb_demo_assets.csv` is already there. To build lookups from your own data, see [Source templates](#source-templates).
2. **Add fields.** On the **Fields** tab, click *Add CIM preset* to add the common asset fields (`mac`, `ip`, `nt_host`, `dns`, `owner` and more), or click *Add field*. Mark the fields that identify an asset as **key fields**.
3. **Preview.** On the **Pipeline** tab, click *Run preview*. It shows how many assets a run would add, remove or change, and saves nothing.
4. **Run.** Click *Run now*, or wait for the schedule (every day at midnight by default).
5. **Use the result.** Search `| inputlookup assetdb`, or add asset details to events with `` `adb_enrich(src_ip)` ``. See [Using the asset list](#using-the-asset-list).

## How assets are merged

AssetDB treats records that share a key value as the same asset. Say one laptop appears in three systems, and each knows something different. `mac` and `nt_host` are key fields. `ip` can hold several values and `owner` holds one:

| Source | mac | nt_host | ip | owner |
| --- | --- | --- | --- | --- |
| cmdb | aa:bb:cc:00:00:01 | LAPTOP-7 | | dana |
| dhcp | aa:bb:cc:00:00:01 | | 10.1.1.20 | |
| edr | | laptop-7 | 10.1.1.31 | |
| cmdb | aa:bb:cc:00:00:02 | SRV-DB | | ops |

1. The first `cmdb` row and the `dhcp` row share a MAC address, so they are the same asset.
2. The `edr` row shares the host name with the first `cmdb` row (case is ignored), so it joins too. It has nothing in common with the `dhcp` row, but both match the `cmdb` row.
3. The last row shares nothing with the others, so it is a separate asset.

The result is two assets. Each field has one value, or all unique values if the field can hold several:

| mac | nt_host | ip | owner |
| --- | --- | --- | --- |
| aa:bb:cc:00:00:01 | laptop-7 | 10.1.1.20, 10.1.1.31 | dana |
| aa:bb:cc:00:00:02 | srv-db | | ops |

Linking is chained: a record joins an asset if it shares a key with any record already in it. That is why one bad key, such as an address shared by many devices, can pull unrelated assets together. See [Key quality](#key-quality). When sources disagree on a single-value field, the field's *Method* decides which value is kept (the most recent by default).

### Scoped keys

The same address can exist in two sites (overlapping private ranges, an acquired network, one tenant per customer), and those records must not merge. Give each source a **Scope**, or choose a **Scope column** in Settings. Then mark key fields that are only unique within a site, such as IP addresses and host names, as **Scoped**. Keep globally unique ones, such as MAC addresses and serial numbers, as **Global**. A scoped key only matches records with the same scope. Turning on scoping changes the keys, so the first run after it rebuilds the asset list.

### Key quality

One bad key can chain unrelated assets into one huge group. Three settings guard against it, all on by default (see [Settings](#settings)): the **key blocklist**, **Max rows per key** and **Max keys per asset**. Records left without any key are dropped.

## The Configure page

The page has four tabs and a status strip.

- **Edits are saved with *Save*.** The editor next to a table holds your changes. Nothing is written until you click *Save*, and closing with unsaved changes asks first. If a step of a save fails, the status strip says which one and offers a retry.
- **Tables are read-only.** Each row has an *Enabled* switch (it saves right away) and *Edit*, *Duplicate* and *Remove* icons.
- **Warning icons** next to a name explain a problem, such as a lookup that cannot be read or a field that no enabled source provides. Click *N items need attention* in the status strip to show only those rows.
- **Help** for each setting is in the (i) tooltip next to its label.
- The **status strip** shows whether everything is saved, the last run and the next scheduled run, with *Run now* and *Run history*.

### Sources

![Editing a source](docs/img/source-editor.png)

A source is a lookup that provides asset records. *Remove* takes a source out of the merge; the lookup itself is not deleted.

| Option | What it does |
| --- | --- |
| Enabled | A disabled source is left out of the merge but keeps its settings. |
| Role | *Authoritative* sources create assets. *Enrich only* sources (a vulnerability scanner, for example) only add data to assets that already exist. A record is added only if it matches exactly one asset; otherwise it is dropped and counted. |
| Max row age | Ignore rows older than this. Rows without a time are kept. |
| Row filter | Keep only rows where this `where` expression is true, for example `status!="decommissioned"`. |
| Scope | The site or tenant of every row in this source. See [Scoped keys](#scoped-keys). |
| Time column | The column that holds each row's time (in epoch seconds), if it is not `_time`. |
| Field mapping | Maps a lookup column to an asset field when the names differ, for example `Computer Name` to `nt_host`. |

### Fields

![Editing a field](docs/img/field-editor.png)

A field is a piece of information you want on each asset. *Add CIM preset* adds the standard asset fields in one step: `mac`, `ip`, `nt_host` and `dns` (keys), plus `owner`, `priority`, `bunit`, `category`, `city`, `country`, `pci_domain` and `is_expected`. Fields you already have are left alone. You do not need the CIM add-on or Enterprise Security.

![The Add CIM preset dialog](docs/img/cim-dialog.png)

Every asset also gets `source`, `source_lookup`, `last_seen` (the latest `_time` of its rows), `scope` and `conflicts`. These names are reserved, as are `_key` and `asset`.

| Property | What it does |
| --- | --- |
| Name | Letters, digits and underscores, starting with a letter or underscore. It cannot be changed later. |
| Description | Notes for people. It does not affect the merge. |
| Enabled | A disabled field is left out of the merge but keeps its settings. |
| Key field | Records with the same value in a key field become one asset. Each key field is indexed for fast lookups. The KV store allows 10 indexes per collection and the app uses one, so at most 9 key fields are indexed. |
| Key scope | *Global* keys match everywhere. *Scoped* keys match only within the same scope. |
| Field type | *Single* keeps one value. *Multivalue* keeps every unique value. |
| Method | For single-value fields, which value wins when sources disagree: *Latest* or *Earliest* (by the row's `_time`), *Min*, *Max*, *Average* or *Sum* (for numbers; set Value type to Number), or *Coalesce* (the first value that is not empty, in the *Source order* you choose). |
| Case sensitive | When off, values match regardless of case and are stored in lowercase. |
| Keep original case | For case-insensitive key fields: store the value as written and ignore case only when matching. Not available with the host name, FQDN, user name, email and operating system normalizers, because they lowercase the value. |
| Normalizer | Puts values in a standard form before matching: trim spaces, MAC (`aa:bb:cc:dd:ee:ff`), IP (no leading zeros), short host name, fully qualified domain name, user name (removes `DOMAIN\` and `@domain`), email, or operating system family. *Default* uses the choice in Settings. |
| Validate as | Drops values that are not of the chosen type (IP, IPv4, IPv6, MAC, email, host name, FQDN, CIDR, whole number, number). The asset stays; only the value goes. |
| Ignore values | Values to skip: an exact value, `re:<regular expression>` or `cidr:<network>`. For example `unknown`, `re:^169\.254\.` or `cidr:127.0.0.0/8`. |
| Use the global ignore list | Also skip the values on the global list in Settings. On by default. |
| Validation pattern | A regular expression. Values that do not match are dropped. |
| Eval expression | An SPL `eval` expression applied to the field before merging. Pipes, backticks and brackets are only allowed inside quoted text. |
| Fill null | A fixed value for assets that have no value in any source. Not allowed on key fields. |
| Value type | The type stored in the KV store: text, number, true/false, time or CIDR. |
| Flag conflicts | When sources disagree, add the field name to the asset's `conflicts` field so you can review it. Uses more memory. |
| Max values, Value order | For multivalue fields: the most values to keep (1 to 100), and which ones: *Most recent first* or *Alphabetical*. |
| Only accept values from | Take values for this field only from the listed sources. |

### Pipeline

![The Pipeline tab](docs/img/pipeline.png)

**Preview.** *Run preview* runs the whole merge without saving anything and compares it with the current asset list. It shows how many assets would be *added*, *removed* or *changed* (including changes to values inside an asset) and how many stay *unchanged*. It also tells you if the safety check would block a real run. *Open in Search* opens the comparison in Search, with one row per asset. The preview does the same work as a real run, so it can take a while with many assets. In the screenshot every asset shows as changed because the existing asset list was built without these fields.

**Merge search.** The search that runs on the schedule and when you click *Run now*, shown one stage at a time in the order the stages run. It is rebuilt from your sources, fields and settings each time you save. To change how merging works, change the configuration. Edits to the saved search `assetdb-lookupgen` are overwritten.

### Settings

![The Settings tab](docs/img/settings.png)

| Setting | What it does |
| --- | --- |
| Max keys per asset | The most keys one asset may have (default 25, at most 100). Bigger groups are not saved and are listed under *Oversized clusters* in Run history. They usually come from a shared key such as a NAT address. |
| Max rows per key | A key found in more rows than this (default 50, 0 turns it off) is not used for matching. |
| Minimum size vs last run | A run that produces fewer assets than this share (default 50%) of the last successful run is not saved and shows as *Blocked*. A run with no assets never replaces the asset list. |
| Run on a schedule, Cron schedule | When the merge runs automatically. The default is `0 0 * * *` (daily at midnight). |
| Runs to keep | How many runs the history keeps (default 200, at most 5000). |
| Default case sensitive, Default normalizer | Used by fields that do not set their own. |
| Scope column | A column in the source lookups that holds each row's scope, for sources without a scope of their own. |
| Key blocklist | Values that are never used for matching, in any key field. The defaults cover all-zero and broadcast MAC addresses, `0.0.0.0`, `::`, loopback and link-local addresses, `localhost`, and placeholders such as `unknown` and `n/a`. A blocked value stays on the asset; it just cannot link two assets. Saving replaces the defaults, so you can remove any of them. |
| Global ignore list | Values skipped in every field that uses the global list. |

### Run history

![The Run history panel](docs/img/run-history.png)

Each run is recorded with its time, status (`ok`, `blocked_low_count` or `empty`), the number of assets, and counts such as rows read, rows without a key and shared keys skipped. The *Run history* panel shows the latest runs and the oversized clusters of the last run. You can also search them:

```
| inputlookup assetdb_runs | sort 0 -run_time
| inputlookup assetdb_overflow
| inputlookup assetdb | search conflicts=*
```

To be told when a run is blocked, enable the saved search `assetdb-run-alert` and add an alert action to it.

## Using the asset list

Search all assets with `| inputlookup assetdb`. In a subsearch, use `| inputlookup append=true assetdb` instead of `append [| inputlookup assetdb]`, because subsearches stop at 50,000 results.

Add asset details to events with a macro. The macros are available in every app:

```
index=firewall | `adb_enrich(src_ip)`
index=dhcp | `adb_enrich_mac(client_mac)`
index=vpn | `adb_enrich_scoped(src_ip, site)`
```

| Macro | What it does |
| --- | --- |
| `adb_enrich(key)` | Finds the asset that has the value of the field `key` as one of its keys and adds `asset_id`, `asset_source`, `asset_source_lookup`, `asset_last_seen` and `asset_<field>` for each field. Fields already on the event are not overwritten. Matching ignores case. |
| `adb_enrich_mac(key)`, `adb_enrich_ip(key)`, `adb_enrich_host(key)` | The same, after putting the value in the standard MAC, IP or short host name form. `AABB.CCDD.EEFF` finds `aa:bb:cc:dd:ee:ff`. The original field is unchanged. |
| `adb_enrich_scoped(key, scope)` | For keys marked *Scoped*. Matches on the scope and the value. |
| `adb_enrich_with(key, lookup)` | Like `adb_enrich`, for a lookup other than `assetdb`. |

Other macros: `input_adb_lookup(lookup)` reads a source lookup and `output_adb_lookup(lookup)` writes one. `normalize_trim`, `normalize_mac`, `normalize_ip`, `normalize_hostname`, `normalize_fqdn`, `normalize_user`, `normalize_email` and `normalize_os` apply the normalizers and work on fields with several values.

## Source templates

The hardest part of setup is building the source lookups. The app includes seven saved searches, all disabled, that build a source lookup using the field names of the CIM preset. To use one, enable it, run it once (it creates the lookup file), and add that lookup on the Sources tab. Adapt the search to your data.

| Saved search | What it builds | Needs | Add as |
| --- | --- | --- | --- |
| `assetdb-src-splunk-hosts` | Every host that sends data to Splunk | Nothing | Authoritative (host name only) |
| `assetdb-src-dhcp-cim` | IP, MAC and host name from DHCP events (CIM Network Sessions) | CIM add-on and a DHCP add-on | Authoritative, with a short max age |
| `assetdb-src-vulnerabilities-cim` | Vulnerability counts and highest CVSS score per host (CIM Vulnerabilities) | CIM add-on and a scanner add-on | Enrich only |
| `assetdb-src-ad-computers` | Enabled Active Directory computer accounts | SA-LDAPSearch | Authoritative |
| `assetdb-src-crowdstrike-devices` | Hosts from CrowdStrike Falcon (internal IP only; the Falcon device ID is the key) | CrowdStrike Falcon Devices Technical Add-on | Authoritative |
| `assetdb-src-defender-machines` | Devices from Microsoft Defender for Endpoint | Splunk Add-on for Microsoft Security | Authoritative |
| `assetdb-src-tenable-assets` | Assets from Tenable Vulnerability Management | Tenable Add-On for Splunk | Authoritative, or Enrich only if another source owns the inventory |

The first template needs no add-on. The others are starting points: check the field names against your data before you rely on them.

## Good to know

- **The asset list is replaced on each run.** For a few seconds, a search that uses `| lookup assetdb` can miss a match. Schedule the merge for a quiet time.
- **Search head clusters.** The configuration you save is copied to all members. The merge runs on one member, and the collections are shared.
- **Memory.** The merge keeps the keys of each asset in memory. That is why *Max keys per asset* is capped at 100.
- **Permissions.** Only admins can change the configuration, the merge search and the collections. Everyone with read access to the app can read the asset list. If it is sensitive, limit access under **Permissions** in Splunk Web.
