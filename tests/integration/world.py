"""A synthetic estate for the comprehensive test: ten source lookups, the field configuration that merges them, and an
independent model (the "oracle") of what the merge must produce.

The oracle reads only the source rows and the configuration. It re-implements the documented rules in plain Python (normalizers,
validation, blocklist, shared-key guard, union-find on keys, one rule per merge method) and never looks at Splunk's answer.
"""
import hashlib
import random
import re
import time
from collections import defaultdict

SEED = 20261109
N_ASSETS = 140
CORP = "corp.example.com"

# ---------------------------------------------------------------------------------------------------------------------
# Field configuration (the "wide array": every merge method, normalizers, validation, ignore lists, fill null, allowed sources,
# eval expressions, conflict tracking, a priority merge across sources whose names have spaces)
# ---------------------------------------------------------------------------------------------------------------------
PRIORITY = ["ServiceNow CMDB", "Jamf MDM", "Tenable VM"]
IGNORED_TAGS = ["decom", "n/a"]
ALLOWED_VLAN = ["Network NAC", "DHCP Leases"]

# name -> (settings of the field, python function used by the oracle where it is needed)
FIELDS = [
    ("mac", dict(key_field="1", case_sensitive="0", field_type="multivalue", normalizer="mac", validation_type="mac")),
    ("ip", dict(key_field="1", case_sensitive="0", field_type="multivalue", normalizer="ip", validation_type="ipv4")),
    ("host", dict(key_field="1", case_sensitive="0", field_type="multivalue", normalizer="hostname")),
    ("serial", dict(key_field="1", case_sensitive="0", field_type="single", normalizer="trim")),
    ("dns", dict(case_sensitive="0", field_type="multivalue", normalizer="fqdn")),
    ("owner", dict(case_sensitive="1", field_type="single", merge_method="latest", normalizer="trim", track_conflicts="1")),
    ("email", dict(case_sensitive="0", field_type="single", merge_method="latest", normalizer="email", validation_type="email")),
    ("owner_domain", dict(case_sensitive="1", field_type="single", merge_method="latest", eval_expression='replace(email, "^[^@]*@", "")')),
    ("os", dict(case_sensitive="1", field_type="single", merge_method="latest", normalizer="os_family")),
    ("location", dict(case_sensitive="1", field_type="single", merge_method="earliest")),
    ("cvss", dict(field_type="single", merge_method="max", value_type="number")),
    ("risk", dict(field_type="single", merge_method="min", value_type="number")),
    ("score", dict(field_type="single", merge_method="avg", value_type="number")),
    ("cost", dict(field_type="single", merge_method="sum", value_type="number")),
    ("criticality", dict(case_sensitive="1", field_type="single", merge_method="coalesce", merge_order=",".join(PRIORITY))),
    ("tags", dict(case_sensitive="0", field_type="multivalue", max_values="4", ignore_values='["decom", "n/a"]')),
    ("region", dict(case_sensitive="1", field_type="single", merge_method="latest", fillnull="unassigned")),
    ("vlan", dict(case_sensitive="1", field_type="single", merge_method="latest", allowed_sources=",".join(ALLOWED_VLAN))),
]
KEYS = [n for n, c in FIELDS if c.get("key_field") == "1"]
CONFLICT_FIELDS = [n for n, c in FIELDS if c.get("track_conflicts") == "1"]
MV_FIELDS = [n for n, c in FIELDS if c.get("field_type") == "multivalue"]
MAX_KEY_SHARE = 50
BLOCKED = {"00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff", "0.0.0.0", "::", "localhost", "unknown", "none", "null", "n/a", "na", "undefined", "-"}

# Sources: name, lookup stem, column mapping (field -> column), options. Disabled sources must not contribute anything.
SOURCES = [
    dict(name="CrowdStrike Falcon", stem="cs", columns={"mac": "device_mac", "host": "device_name", "ip": "local_ip", "os": "platform"}),
    dict(name="Tenable VM", stem="tenable", columns={"ip": "ip_addr", "dns": "fqdn", "cvss": "cvss_score", "risk": "risk_factor"}),
    dict(name="ServiceNow CMDB", stem="snow", columns={"serial": "serial_number", "host": "name", "criticality": "business_criticality", "location": "site"}),
    dict(name="Active Directory", stem="ad", columns={"dns": "dNSHostName", "host": "sAMAccountName", "email": "mail", "os": "operatingSystem"}),
    dict(name="DHCP Leases", stem="dhcp", columns={"host": "client_hostname", "vlan": "vlan_id"}),
    dict(name="Jamf MDM", stem="jamf", columns={"serial": "serial_number", "email": "user_email", "os": "os_version", "criticality": "tier"}),
    dict(name="Qualys Scan", stem="qualys", columns={"ip": "address", "host": "netbios", "risk": "qid_risk"}, filter='status="active"'),
    dict(name="Network NAC", stem="nac", columns={"mac": "endpoint_mac", "ip": "endpoint_ip", "vlan": "vlan", "tags": "labels"}),
    dict(name="AWS EC2", stem="aws", columns={"ip": "private_ip", "host": "instance_name", "tags": "tag_list", "region": "az"}, time_field="last_seen_ts", max_age="30d"),
    dict(name="Datacenter Roster", stem="roster", columns={"serial": "serial_number", "host": "asset_name", "owner": "responsible", "cost": "monthly_cost", "score": "health_score"}),
    dict(name="Legacy Inventory", stem="legacy", columns={"mac": "mac", "host": "host"}, enabled=False),
]


# ---------------------------------------------------------------------------------------------------------------------
# Normalizers and validation, as documented in default/macros.conf and generator.js
# ---------------------------------------------------------------------------------------------------------------------
def n_mac(v):
    v = v.strip().lower()
    m = re.match(r"^([0-9a-f]{2})[^0-9a-f]?([0-9a-f]{2})[^0-9a-f]?([0-9a-f]{2})[^0-9a-f]?([0-9a-f]{2})[^0-9a-f]?([0-9a-f]{2})[^0-9a-f]?([0-9a-f]{2})$", v)
    return ":".join(m.groups()) if m else v


def n_ip(v):
    t = v.strip()
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", t):
        return ".".join(str(int(p)) for p in t.split("."))
    return t.lower()


def n_host(v):
    t = v.strip()
    return t if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", t) else re.sub(r"\..*$", "", t).lower()


def n_os_family(v):
    if not v.strip():
        return v
    for pat, out in [
        (r"ios[ _-]?x[er]|(^|[^a-z])f5([^a-z]|$)|big-?ip|(^|[^a-z])asa([^a-z]|$)|junos|fortios|pan-?os|nx-?os|routeros|cisco", "Network device"),
        (r"ipad", "iPadOS"), (r"iphone|(^|[^a-z])ios([^a-z]|$)", "iOS"),
        (r"macos|mac ?os|os ?x|darwin|macbook|imac|catalina|big sur|monterey|ventura|sonoma|sequoia|tahoe|(^|[^a-z])mac([^a-z]|$)", "Mac"),
        (r"android", "Android"), (r"windows[ _-]?server|win[ _-]?server|windows[ _-]?20[0-9]{2}", "Windows Server"),
        (r"windows|winxp|win ?(7|8|10|11)", "Windows Desktop"), (r"esxi|vmware|hyper-?v|proxmox|xenserver", "Hypervisor"),
        (r"aix|solaris|hp-?ux|freebsd|openbsd|netbsd|unix", "Unix"),
        (r"linux|ubuntu|debian|centos|red.?hat|rhel|suse|fedora|almalinux|rocky|kali|alpine", "Linux"),
    ]:
        if re.search(pat, v, re.I):
            return out
    return "Other"


NORMALIZE = {
    "trim": lambda v: v.strip(), "mac": n_mac, "ip": n_ip, "hostname": n_host, "email": lambda v: v.strip().lower(),
    "fqdn": lambda v: re.sub(r"\.$", "", v.strip()).lower(), "os_family": n_os_family,
}
IPV4 = r"((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)"
VALID = {
    "mac": r"^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$", "ipv4": "^%s$" % IPV4, "email": r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
}


def blocked(key):
    k = key.lower()
    if k in BLOCKED or re.match(r"^(00[:-]?){5}00$", k) or re.match(r"^(ff[:-]?){5}ff$", k):
        return True
    m = re.match(r"^(\d+)\.(\d+)\.\d+\.\d+$", k)
    return bool(m and (m.group(1) == "127" or (m.group(1) == "169" and m.group(2) == "254")))


# ---------------------------------------------------------------------------------------------------------------------
# The estate
# ---------------------------------------------------------------------------------------------------------------------
OS_RAW = {
    "win": ["Windows 10 Pro", "Windows 11 Enterprise", "Microsoft Windows 10"],
    "srv": ["Windows Server 2019 Datacenter", "Windows Server 2022"],
    "lin": ["Ubuntu 22.04 LTS", "Red Hat Enterprise Linux 9", "Debian 12"],
    "mac": ["macOS Sonoma 14.4", "Mac OS X 10.15"],
    "ios": ["iPhone iOS 17.2"],
    "and": ["Android 14"],
}
LOCATIONS = ["Toronto", "Berlin", "Austin", "Oslo", "Denver"]
OWNERS = ["Nancy Doe", "Fred Goldman", "Marge Wyatt", "John Smith"]


def build(now=None):
    """Returns (rows_by_source, truth). rows_by_source: stem -> list of dicts (raw CSV rows, as strings, `_time` as epoch)."""
    now = now or int(time.time())
    rnd = random.Random(SEED)
    rows = defaultdict(list)
    clock = [now - 20 * 86400]

    def tick():
        clock[0] += rnd.randint(40, 1400)          # unique, strictly increasing times within the generation order; shuffled below
        return clock[0]

    def add(stem, **kw):
        kw.setdefault("_time", tick())
        rows[stem].append({k: ("" if v is None else str(v)) for k, v in kw.items()})

    def mac_variants(m, i):
        up = m.upper()
        flat = m.replace(":", "")
        return [m, up.replace(":", "-"), ".".join(flat[j:j + 4] for j in (0, 4, 8)), up][i % 4]

    assets = []
    for i in range(N_ASSETS):
        kind = ["win", "srv", "lin", "mac", "win", "lin", "ios", "srv", "and", "win"][i % 10]
        a = dict(i=i, kind=kind, mac="02:aa:bb:%02x:%02x:%02x" % (i // 256, i % 256, (i * 7) % 256), ip="10.20.%d.%d" % (i // 250, i % 250 + 1),
                 host="%s-%03d" % ({"win": "wks", "srv": "srv", "lin": "lnx", "mac": "mbp", "ios": "iph", "and": "and"}[kind], i),
                 serial=("SN%06d" % (100000 + i)) if i % 2 == 0 else "", owner=OWNERS[i % 4], loc=LOCATIONS[i % 5])
        a["fqdn"] = "%s.%s" % (a["host"], CORP)
        a["email"] = "user%03d@Example.com" % i if kind in ("win", "mac", "ios", "and") else ""
        assets.append(a)

    for a in assets:
        i, kind = a["i"], a["kind"]
        os_raw = OS_RAW[kind][i % len(OS_RAW[kind])]
        # CrowdStrike: every endpoint except network-only servers every 5th; MAC in dashes/UPPER, host UPPER, one row per sensor check-in (two rows for some)
        if i % 5 != 4:
            for rep in range(1 + (i % 7 == 0)):
                add("cs", device_mac=mac_variants(a["mac"], i).upper().replace(":", "-"), device_name=a["host"].upper(), local_ip=a["ip"], platform=os_raw)
        # Tenable: several rows per asset (one per scan), cvss/risk numbers, FQDN with random case, some with a trailing dot
        if i % 3 != 2:
            for rep in range(1 + i % 3):
                add("tenable", ip_addr=a["ip"], fqdn=(a["fqdn"].upper() if rep % 2 else a["fqdn"]) + ("." if i % 9 == 0 else ""), cvss_score="%.1f" % (rnd.randint(10, 99) / 10),
                    risk_factor=rnd.randint(1, 10))
        # ServiceNow: keyed by serial + host (short or FQDN, mixed case), ownership, site, criticality, cost lives in the roster instead
        if a["serial"]:
            add("snow", serial_number=a["serial"].lower() if i % 4 == 0 else a["serial"], name=(a["fqdn"].upper() if i % 3 == 0 else a["host"]),
                business_criticality=["low", "medium", "high"][i % 3], site=a["loc"], **{"owner": a["owner"]})
        # Active Directory: windows + mac (domain joined): dNSHostName, sAMAccountName with a trailing $ ... host key is the sAMAccountName w/o $ is not
        # used; keep it simple: FQDN and the short name, mail, OS string
        if kind in ("win", "srv") or i % 11 == 0:
            add("ad", dNSHostName=a["fqdn"] + ("." if i % 8 == 0 else ""), sAMAccountName=a["host"].upper(), mail=(a["email"] if a["email"] else ""), operatingSystem=os_raw)
        # DHCP leases: lowercase colon MAC + IP + client host (+ vlan); every 10th lease is for a junk MAC; one shared gateway address leased to many
        if i % 4 != 3:
            add("dhcp", mac=a["mac"], ip=a["ip"], client_hostname=a["host"] if i % 2 else a["fqdn"], vlan_id=100 + i % 5)
        if i < 55:
            add("dhcp", mac="02:cc:dd:%02x:00:01" % i, ip="10.9.9.9", client_hostname="guest-%03d" % i, vlan_id=999)   # the shared key: 55 sets share 10.9.9.9
        # Jamf: macs/phones/tablets: serial + dotted MAC, email, os, tier; region left blank, owner given
        if kind in ("mac", "ios") or i % 13 == 0:
            add("jamf", serial_number=a["serial"] or ("JS%05d" % i), mac=mac_variants(a["mac"], 2), user_email=a["email"].upper() if a["email"] else "",
                os_version=os_raw, tier=["gold", "silver", "bronze"][i % 3], owner=a["owner"])
        # Qualys: some rows are retired (filtered out), some have a different host spelling; risk + a second one
        if i % 2 == 1 or i % 6 == 0:
            add("qualys", address=a["ip"], netbios=a["host"].upper(), qid_risk=rnd.randint(2, 9), status="active")
        if i % 17 == 0:
            add("qualys", address="10.77.%d.%d" % (i % 200, i % 200), netbios="retired-%03d" % i, qid_risk=99, status="retired")
        # NAC: mac + ip + vlan + pipe separated tags (some noisy: decom, N/A, duplicates)
        if i % 3 != 1:
            tags = rnd.sample(["pci", "dmz", "vip", "iot", "guest", "corp", "decom", "N/A"], rnd.randint(1, 4))
            add("nac", endpoint_mac=a["mac"].replace(":", "-"), endpoint_ip=a["ip"], vlan=200 + i % 3, labels="|".join(tags + tags[:1]))
        # AWS: only servers/linux; recent rows count, 40+ day old rows are dropped by the max age
        if kind in ("srv", "lin"):
            fresh = now - rnd.randint(1, 8) * 86400
            add("aws", private_ip=a["ip"], instance_name=a["host"].upper(), tag_list="aws|%s" % ("prod" if i % 2 else "stage"), az=["us-east-1", "eu-west-1"][i % 2],
                last_seen_ts=fresh, _time="")
            if i % 4 == 0:
                add("aws", private_ip=a["ip"], instance_name=a["host"], tag_list="old-tag", az="ap-south-1", last_seen_ts=now - 40 * 86400 - i, _time="")
        # Roster: serial + short host: owner, monthly cost, health score (numbers, summed / averaged)
        if i % 5 in (0, 1):
            add("roster", serial_number=a["serial"] or "", asset_name=a["host"], responsible=a["owner"] if i % 3 else "  " + a["owner"] + "  ",
                monthly_cost=rnd.randint(20, 400), health_score=rnd.randint(40, 100))
        # Legacy (disabled source): MACs that must never show up
        add("legacy", mac="02:ee:ee:%02x:00:00" % i, host="legacy-%03d" % i)

    # Edge rows: junk and invalid keys, transitive chains, a row with no key at all, whitespace, empty and repeated values
    add("dhcp", mac="00:00:00:00:00:00", ip="0.0.0.0", client_hostname="", vlan_id=1)                       # all blocked: dropped
    add("dhcp", mac="ff:ff:ff:ff:ff:ff", ip="169.254.1.5", client_hostname="unknown", vlan_id=2)            # all blocked: dropped
    add("nac", endpoint_mac="garbage", endpoint_ip="999.1.1.1", vlan=7, labels="x")                           # invalid mac / ip: no key left
    add("cs", device_mac="", device_name="", local_ip="", platform="Windows 10")                              # no key at all
    # transitive chain: three records that only link through each other (mac in A, mac+host in B, host+serial in C)
    add("cs", device_mac="AA-AA-AA-00-00-01", device_name="CHAIN-ONE", local_ip="", platform="Ubuntu 20.04")
    add("dhcp", mac="aa:aa:aa:00:00:01", ip="10.200.0.1", client_hostname="chain-one.corp.example.com", vlan_id=100)
    add("snow", serial_number="CHAINSER", name="chain-one", business_criticality="high", site="Oslo", owner="Chain Owner")
    # two assets that look alike but share nothing (must stay apart): same last octet, different hosts and MACs
    add("dhcp", mac="aa:aa:aa:00:00:02", ip="10.200.1.1", client_hostname="twin-a", vlan_id=100)
    add("dhcp", mac="aa:aa:aa:00:00:03", ip="10.200.2.1", client_hostname="twin-b", vlan_id=100)

    # a record that only knows the MAC address, written with dashes: it links to its asset, but the Explorer's raw match cannot see it
    add("nac", endpoint_mac=assets[3]["mac"].upper().replace(":", "-"), endpoint_ip="", vlan="", labels="solo")

    # shuffle the order of the rows inside every source so file order never decides anything; times stay as generated
    for stem in rows:
        rnd.shuffle(rows[stem])
    return rows, assets


def lookup_name(prefix, stem):
    return "%s%s.csv" % (prefix, stem)


# ---------------------------------------------------------------------------------------------------------------------
# The oracle
# ---------------------------------------------------------------------------------------------------------------------
def _slug_ok(name):
    return re.sub(r"[^A-Za-z0-9_]+", "_", name)


def expected(rows_by_stem, now):
    """Merge the rows the way the documentation says. Returns a list of dicts: asset (set of keys), source (set), last_seen, plus one entry per field
    (a sorted list of values for multivalue fields, a scalar or None for single ones), conflicts (set) and `_rows` (for provenance)."""
    cfg = dict(FIELDS)
    prepared = []   # one dict per row that survives the source options
    for src in SOURCES:
        if src.get("enabled") is False:
            continue
        for raw in rows_by_stem[src["stem"]]:
            row = {k: (v if v != "" else None) for k, v in raw.items()}
            if src.get("filter") == 'status="active"' and row.get("status") != "active":
                continue
            t = row.get("_time")
            if src.get("time_field"):
                t = row.get(src["time_field"])
            t = float(t) if t is not None else None
            if src.get("max_age") and t is not None and t < now - 30 * 86400:
                continue
            vals = {}
            for field, _ in FIELDS:
                col = src["columns"].get(field)
                v = row.get(col) if col else row.get(field)
                vals[field] = v
            if src["name"] not in ALLOWED_VLAN:
                vals["vlan"] = None
            prepared.append(dict(src=src, t=t, raw=row, vals=vals))

    out_rows = []
    for r in prepared:
        v = {}
        for field, c in FIELDS:
            val = r["vals"][field]
            if val is None:
                v[field] = []
                continue
            items = val.split("|") if c.get("field_type") == "multivalue" else [val]
            norm = NORMALIZE.get(c.get("normalizer", "none"))
            if norm:
                items = [norm(x) for x in items]
            if c.get("case_sensitive") == "0":
                items = [x.lower() for x in items]
            if c.get("validation_type") in VALID:
                items = [x for x in items if re.match(VALID[c["validation_type"]], x)]
            if c.get("ignore_values"):
                ign = {x.lower() if c.get("case_sensitive") == "0" else x for x in eval(c["ignore_values"])}   # noqa: S307 (own literal list)
                items = [x for x in items if x not in ign]
            v[field] = items
        # eval expression: owner_domain = replace(email, "^[^@]*@", "")
        v["owner_domain"] = [re.sub(r"^[^@]*@", "", x) for x in v["email"]]
        r["v"] = v
        r["keys"] = [k for f in KEYS for k in v[f] if k.strip() and not blocked(k)]
        r["keys"] = list(dict.fromkeys(r["keys"]))
        out_rows.append(r)

    # keys: rows with the same key set are one entry for the share count (the merge groups identical key sets first)
    entries = {}
    for r in out_rows:
        if r["keys"]:
            entries.setdefault(tuple(sorted(r["keys"])), []).append(r)
    share = defaultdict(int)
    for ks in entries:
        for k in ks:
            share[k] += 1
    junk = {k for k, n in share.items() if n > MAX_KEY_SHARE}

    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    cleaned = []
    for ks, rs in entries.items():
        ks2 = [k for k in ks if k not in junk]
        if not ks2:
            continue
        for k in ks2:
            parent.setdefault(k, k)
        for k in ks2[1:]:
            parent[find(k)] = find(ks2[0])
        cleaned.append((ks2, rs))
    groups = defaultdict(list)
    keys_of = defaultdict(set)
    for ks2, rs in cleaned:
        root = find(ks2[0])
        groups[root].extend(rs)
        keys_of[root].update(ks2)

    assets = []
    for root, rs in groups.items():
        a = dict(asset=keys_of[root], source={r["src"]["name"] for r in rs}, last_seen=max(r["t"] for r in rs if r["t"] is not None), _rows=rs)
        for field, c in FIELDS:
            ft = c.get("field_type")
            method = c.get("merge_method", "latest")
            have = [(r["t"] or 0, r["v"][field], r) for r in rs if r["v"][field]]
            if ft == "multivalue":
                # the merge tags every value with its zero padded row time, sorts descending (so equal times fall back to the value, descending),
                # drops the tag and keeps the first of each value
                tagged = sorted({"%015.3f|%s" % (t, x) for t, vals, _ in have for x in vals}, reverse=True)
                newest_first = list(dict.fromkeys(x.split("|", 1)[1] for x in tagged))
                a[field] = newest_first[:int(c.get("max_values", 10))]
                continue
            if not have:
                a[field] = None
                continue
            scalars = [(t, vals[0], r) for t, vals, r in have]
            if method == "latest":
                a[field] = max(scalars, key=lambda x: x[0])[1]
            elif method == "earliest":
                a[field] = min(scalars, key=lambda x: ("%015.3f" % x[0], x[1]))[1]
            elif method in ("min", "max", "sum", "avg"):
                nums = [float(x[1]) for x in scalars if re.match(r"^-?\d+(\.\d+)?$", x[1])]
                a[field] = None if not nums else {"min": min, "max": max, "sum": sum, "avg": lambda n: sum(n) / len(n)}[method](nums)
            elif method == "coalesce":
                a[field] = None
                for name in c["merge_order"].split(","):
                    cand = [x for x in scalars if x[2]["src"]["name"] == name]
                    if cand:
                        a[field] = max(cand, key=lambda x: x[0])[1]
                        break
        for field, c in FIELDS:
            if c.get("fillnull") and not a[field]:
                a[field] = c["fillnull"]
        a["conflicts"] = {f for f in CONFLICT_FIELDS if len({r["v"][f][0] for r in rs if r["v"][f]}) > 1}
        a["_key"] = hashlib.md5("::".join(sorted(a["asset"])).encode()).hexdigest()
        assets.append(a)
    return assets, dict(prepared=len(prepared), entries=len(entries), junk=junk)
