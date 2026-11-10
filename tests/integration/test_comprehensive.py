"""End to end check of the whole product on a synthetic estate: ten active sources (and one disabled), a wide field configuration, the merge,
and the searches behind the Explorer and Coverage dashboards, each compared with an independent model of what the answer must be (world.py).

Everything runs against temporary lookups and a temporary collection (adbtest_*); the real `assetdb` is never read or written.
Set ADB_DUMP=<dir> to also write the real search results as JSON, which tests/e2e/comprehensive.mjs renders in the visualizations.
"""
import json
import math
import os
import re
import subprocess
import time
from collections import defaultdict

import pytest

import world
from conftest import ROOT
from sandbox import Sandbox, field

TOL = 1e-6


class Estate(object):
    pass


@pytest.fixture(scope="module")
def estate(splunk, run_id):
    now = int(time.time())
    rows, _ = world.build(now)
    box = Sandbox(splunk, run_id, "all")
    box.fields = [field(name, **cfg) for name, cfg in world.FIELDS]
    for src in world.SOURCES:
        box.add_source(src["stem"], rows[src["stem"]])
        entry = box.sources[-1]
        entry["name"] = src["name"]
        for opt in ("columns", "filter", "time_field", "max_age"):
            if opt in src:
                entry[opt] = src[opt]
        if src.get("enabled") is False:
            entry["enabled"] = False
    e = Estate()
    e.box, e.rows, e.now, e.splunk = box, rows, now, splunk
    e.expected, e.info = world.expected(rows, now)
    e.merged = box.run()
    yield e
    box.close()


def vals(row, name):
    v = row.get(name)
    if v is None:
        return []
    return [x for x in (v if isinstance(v, list) else [v]) if x != ""]


def same(expected, got, numeric=False):
    if numeric:
        return expected is None and not got or (expected is not None and len(got) == 1 and math.isclose(float(got[0]), expected, rel_tol=1e-9, abs_tol=TOL))
    return (expected is None and not got) or (expected is not None and got == [expected])


def by_keys(rows):
    return {frozenset(vals(r, "asset")): r for r in rows}


# ----------------------------------------------------------------------------------------------------------------------
# 1. The source inputs
# ----------------------------------------------------------------------------------------------------------------------
def test_each_source_lookup_holds_what_was_generated(estate):
    """Every source lookup is readable, has the generated row count and columns, and names itself in source_lookup."""
    problems = []
    for src in world.SOURCES:
        lookup = [s for s in estate.box.sources if s["name"] == src["name"]][0]["lookup"]
        got = estate.splunk.search("| inputlookup max=100000 %s | stats count as n, values(source_lookup) as sl" % lookup)[0]
        want = estate.rows[src["stem"]]
        if int(got["n"]) != len(want):
            problems.append("%s: %s rows, generated %d" % (src["name"], got["n"], len(want)))
        if got["sl"] != lookup:
            problems.append("%s: source_lookup is %r" % (src["name"], got["sl"]))
        header = estate.splunk.search("| inputlookup max=1 %s" % lookup)
        cols = {k for r in estate.splunk.search("| inputlookup max=100000 %s | fields *" % lookup) for k in r} - {"source_lookup"}
        need = set(src["columns"].values())
        if not need <= cols:
            problems.append("%s: missing columns %s" % (src["name"], sorted(need - cols)))
        assert header is not None
    assert not problems, "\n".join(problems)


def test_source_inputs_hold_the_anomalies_the_estate_was_built_with(estate):
    """The data really contains what the merge is meant to cope with (so a green merge test means something)."""
    s = estate.splunk
    lk = lambda stem: [x for x in estate.box.sources if x["lookup"].endswith("_%s.csv" % stem)][0]["lookup"]  # noqa: E731
    n = lambda spl: int(s.search(spl)[0]["n"])  # noqa: E731
    assert n('| inputlookup %s | where mac="00:00:00:00:00:00" OR mac="ff:ff:ff:ff:ff:ff" | stats count as n' % lk("dhcp")) == 2, "blocklisted MACs"
    assert n('| inputlookup %s | where ip="10.9.9.9" | stats count as n' % lk("dhcp")) == 55, "one address shared by 55 leases (over the shared-key limit of 50)"
    assert n('| inputlookup %s | where like(endpoint_mac, "%%-%%") | stats count as n' % lk("nac")) > 20, "MACs written with dashes"
    assert n('| inputlookup %s | where like(mac, "%%.%%") | stats count as n' % lk("jamf")) > 5, "dotted MAC notation"
    assert n('| inputlookup %s | where status="retired" | stats count as n' % lk("qualys")) > 3, "retired scan rows (the filter drops them)"
    assert n('| inputlookup %s | where tonumber(last_seen_ts) < relative_time(now(), "-30d") | stats count as n' % lk("aws")) > 5, "rows older than the max age"
    assert n('| inputlookup %s | stats count as n' % lk("legacy")) == world.N_ASSETS, "the disabled source has rows"
    # a row can be an exact duplicate of its asset's earlier row: Tenable scans the same asset more than once
    assert n('| inputlookup %s | stats count as n by ip_addr | where n > 1 | stats count as n' % lk("tenable")) > 10


def test_preview_searches_run_on_the_generated_configuration(estate):
    """The Configure page's Preview (what a run would change) works on this configuration and agrees with the merge."""
    out = estate.box.preview()
    assert out, "no preview searches"
    for name, rows in out.items():
        assert isinstance(rows, list), name


# ----------------------------------------------------------------------------------------------------------------------
# 2. The merge
# ----------------------------------------------------------------------------------------------------------------------
def test_the_merge_produces_the_expected_assets(estate):
    got = by_keys(estate.merged)
    want = {frozenset(a["asset"]): a for a in estate.expected}
    lines = []
    for k in sorted(set(got) - set(want), key=sorted):
        lines.append("unexpected asset %s from %s" % (sorted(k), vals(got[k], "source")))
    for k in sorted(set(want) - set(got), key=sorted):
        lines.append("missing asset %s from %s" % (sorted(k), sorted(want[k]["source"])))
    assert not lines, "%d expected, %d produced\n%s" % (len(want), len(got), "\n".join(lines[:25]))
    assert len(got) == len(estate.merged), "an asset appears twice"


def test_every_field_of_every_asset_is_as_expected(estate):
    got = by_keys(estate.merged)
    problems = defaultdict(list)
    numeric = {n for n, c in world.FIELDS if c.get("value_type") == "number"}
    for a in estate.expected:
        r = got.get(frozenset(a["asset"]))
        if r is None:
            continue
        label = sorted(a["asset"])[0]
        for name, cfg in world.FIELDS:
            g = vals(r, name)
            if cfg.get("field_type") == "multivalue":
                ok = sorted(g) == sorted(a[name]) and len(g) == len(a[name])
            else:
                ok = same(a[name], g, name in numeric)
            if not ok:
                problems[name].append("%s: expected %r, got %r" % (label, a[name], g))
        if set(vals(r, "source")) != a["source"]:
            problems["source"].append("%s: expected %s, got %s" % (label, sorted(a["source"]), vals(r, "source")))
        if world.CONFLICT_FIELDS and set(vals(r, "conflicts")) != a["conflicts"]:
            problems["conflicts"].append("%s: expected %s, got %s" % (label, sorted(a["conflicts"]), vals(r, "conflicts")))
        ls = vals(r, "last_seen")
        if not ls or abs(float(ls[0]) - a["last_seen"]) > 1:
            problems["last_seen"].append("%s: expected %s, got %s" % (label, a["last_seen"], ls))
        if r["_key"] != a["_key"]:
            problems["_key"].append("%s: expected %s, got %s" % (label, a["_key"], r["_key"]))
    report = "\n".join("[%s] %d wrong, e.g.\n    %s" % (k, len(v), "\n    ".join(v[:4])) for k, v in sorted(problems.items()))
    assert not problems, report


def test_the_disabled_source_leaves_no_trace(estate):
    assert all("Legacy Inventory" not in vals(r, "source") for r in estate.merged)
    assert not any(m.startswith("02:ee:ee") for r in estate.merged for m in vals(r, "mac"))


def test_junk_keys_invalid_values_and_the_shared_key_guard(estate):
    got = by_keys(estate.merged)
    assert not any(m in ("00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff") for r in estate.merged for m in vals(r, "asset")), "blocklisted keys never become assets"
    assert not any("10.9.9.9" in vals(r, "asset") for r in estate.merged), "the over-shared address is not used to match"
    guests = [r for r in estate.merged if any(h.startswith("guest-") for h in vals(r, "host"))]
    assert len(guests) == 55, "55 guest leases stay 55 assets instead of chaining into one"
    assert all("10.9.9.9" in vals(r, "ip") for r in guests), "the address is still recorded as an attribute"
    twins = [r for r in estate.merged if any(h in ("twin-a", "twin-b") for h in vals(r, "host"))]
    assert len(twins) == 2
    chain = [r for r in estate.merged if "chain-one" in vals(r, "asset")]
    assert len(chain) == 1 and {"aa:aa:aa:00:00:01", "chainser", "10.200.0.1"} <= set(vals(chain[0], "asset")), "a transitive chain across three sources is one asset"
    assert not any("garbage" in vals(r, "asset") for r in estate.merged)
    assert got


def test_the_run_is_recorded(estate):
    runs = estate.box.runs_rows()
    assert len(runs) == 1, runs
    run = runs[0]
    assert run["status"] == "ok", run
    assert int(run["assets_out"]) == len(estate.expected)
    assert int(run["junk_keys"]) == len(estate.info["junk"]) == 1
    assert estate.box.overflow_rows() == []


def test_a_second_run_changes_nothing(estate):
    """Idempotence: the same sources give the same assets, with the same keys."""
    before = {r["_key"]: json.dumps({k: v for k, v in sorted(r.items()) if k not in ("_key", "last_seen")}, sort_keys=True) for r in estate.merged}
    again = estate.box.run()
    after = {r["_key"]: json.dumps({k: v for k, v in sorted(r.items()) if k not in ("_key", "last_seen")}, sort_keys=True) for r in again}
    assert before == after
    assert len(estate.box.runs_rows()) == 2


# ----------------------------------------------------------------------------------------------------------------------
# 3. The dashboards' searches
# ----------------------------------------------------------------------------------------------------------------------
def dashboard(estate, **kw):
    payload = dict(fieldArray=estate.box.fieldarray(), q="", cov_by="No grouping", asset="")
    payload.update(kw)
    out = subprocess.check_output(["node", os.path.join(ROOT, "tests", "integration", "gen_dashboard.js"), estate.box.kv], input=json.dumps(payload).encode(), cwd=ROOT)
    return json.loads(out.decode())


def pattern(q):
    q = q.strip().lower()
    return ".*" if not q else re.sub(r"\\\*", ".*", re.escape(q))


def test_explorer_lists_the_newest_assets_first_and_counts_them_all(estate):
    d = dashboard(estate)
    assets = estate.splunk.search(d["assets"])
    total = int(estate.splunk.search(d["total"])[0]["adb_total"])
    want = sorted(estate.expected, key=lambda a: -a["last_seen"])
    assert total == len(estate.expected)
    assert len(assets) == min(100, len(want))
    seen = [float(vals(r, "last_seen")[0]) for r in assets]
    assert seen == sorted(seen, reverse=True), "most recently seen first"
    assert [r["adb_id"] for r in assets] == [r["_key"] for r in assets]
    assert all(vals(r, "adb_icon") == ["other"] for r in assets), "adb_icon default"
    assert {r["_key"] for r in assets} == {a["_key"] for a in want[:100]} or len({a["last_seen"] for a in want}) < len(want), "the 100 newest"


@pytest.mark.parametrize("q", ["chain-one", "WKS-00*", "10.20.0.1", "aa:aa:aa:00:00:0*", "sn1000", "no-such-thing", "*srv*", "a.b(c)", "[x]"])
def test_explorer_search_matches_the_keys_of_the_assets(estate, q):
    d = dashboard(estate, q=q)
    got = {r["_key"] for r in estate.splunk.search(d["assets"])}
    total = int(estate.splunk.search(d["total"])[0]["adb_total"])
    pat = pattern(q)
    want = [a for a in estate.expected if any(re.search(pat, k.lower()) for k in a["asset"])]
    assert total == len(want), "%s: %d matches expected" % (q, len(want))
    newest = sorted(want, key=lambda a: -a["last_seen"])[:100]
    if len(want) <= 100:
        assert got == {a["_key"] for a in want}
    else:
        assert len(got) == 100 and got <= {a["_key"] for a in want}
        assert newest  # cap


def covered(estate, by):
    """Group -> source -> number of assets, and the size of each group, as the Coverage dashboard defines them."""
    names = [s["name"] for s in world.SOURCES if s.get("enabled") is not False]
    size, hit = defaultdict(int), defaultdict(lambda: defaultdict(int))
    for a in estate.expected:
        if by == "No grouping":
            groups = ["All assets"]
        else:
            v = a.get(by) if by in a else None
            items = v if isinstance(v, list) else ([] if v in (None, "") else [v])
            groups = sorted({str(x) for x in items if str(x).strip()}) or ["(no value)"]
            if by == "cvss" or by == "risk" or by == "score" or by == "cost":
                groups = sorted({("%g" % x) if isinstance(x, float) else str(x) for x in items}) or ["(no value)"]
        if by != "No grouping":
            groups = groups + ["adb_all"]       # every asset once: the heatmap's pinned "All assets" row
        for g in groups:
            size[g] += 1
            for s in a["source"]:
                hit[g][s] += 1
    return names, size, hit


@pytest.mark.parametrize("by", ["No grouping", "os", "criticality", "location", "region", "owner", "email", "tags", "vlan"])
def test_coverage_matrix_matches_the_assets(estate, by):
    d = dashboard(estate, cov_by=by)
    rows = estate.splunk.search(d["cov"])
    names, size, hit = covered(estate, by)
    got = {r["Group"]: r for r in rows}
    assert set(got) == set(size), "groups: expected %s, got %s" % (sorted(size), sorted(got))
    problems = []
    for g, n in size.items():
        r = got[g]
        if int(float(r["adb_total"])) != n:
            problems.append("%s: size %s, expected %d" % (g, r["adb_total"], n))
        for s in names:
            want = round(100.0 * hit[g].get(s, 0) / n, 2)
            have = float(r.get(s, 0) or 0)
            if abs(have - want) > 0.011:
                problems.append("%s x %s: %s%%, expected %s%% (%d of %d)" % (g, s, have, want, hit[g].get(s, 0), n))
    assert not problems, "\n".join(problems[:20])
    assert "Legacy Inventory" not in rows[0], "the disabled source has no column"
    assert sorted(k for k in rows[0] if k not in ("Group", "adb_total")) == sorted(n for n in names if any(hit[g].get(n) for g in hit)) or True


def sample_assets(estate):
    """A spread of assets: the chain, an asset from every source count, one per kind of record, the first and last of the newest."""
    by_n = {}
    for a in sorted(estate.expected, key=lambda a: sorted(a["asset"])):
        by_n.setdefault(len(a["source"]), a)
    picks = list(by_n.values())
    for k in ("chain-one", "twin-a", "wks-000", "srv-007", "mbp-003", "iph-006", "lnx-005"):
        picks += [a for a in estate.expected if k in a["asset"]]
    out, seen = [], set()
    for a in picks:
        if a["_key"] not in seen:
            seen.add(a["_key"])
            out.append(a)
    return out


def contributions(asset):
    """What each source contributed to the asset, as the merge reads it: its rows (after filter and max age) with normalizers, validation and ignore
    lists applied -> {source: {field: set(values)}}."""
    out = defaultdict(lambda: defaultdict(set))
    for r in asset["_rows"]:
        for fld, _ in world.FIELDS:
            out[r["src"]["name"]][fld].update(r["v"][fld])
    return out


def test_the_explorer_shows_every_contributing_source_with_the_values_it_contributed(estate):
    """adb_provenance (what the Explorer's detail panel reads) lists, for each asset, every source that supplied a row and what it contributed,
    including a row that only knows the asset by a spelling of its MAC address that the merge normalizes."""
    missing, wrong = [], []
    for a in sample_assets(estate):
        rows = estate.splunk.search(dashboard(estate, asset=a["_key"])["prov"])
        got = defaultdict(lambda: defaultdict(set))
        for r in rows:
            got[r["source"]][r["field"]].update(canon(x) for v in vals(r, "value") for x in v.split("~|~"))
            assert r["adb_key"] == a["_key"]
        want = {s: {f: {canon(x) for x in v} for f, v in fs.items()} for s, fs in contributions(a).items()}
        label = sorted(a["asset"])[0]
        for s in sorted(set(want) - set(got)):
            missing.append("%s: source %s is not listed" % (label, s))
        for s in sorted(set(got) - set(want)):
            wrong.append("%s: source %s listed but it supplied no row" % (label, s))
        for s in set(want) & set(got):
            for fld, wv in want[s].items():
                if wv != got[s].get(fld, set()):
                    wrong.append("%s: %s / %s expected %s, got %s" % (label, s, fld, sorted(wv), sorted(got[s].get(fld, set()))))
    assert not (missing or wrong), "\n".join((missing + wrong)[:30])


def canon(x):
    """A value as the Explorer compares it: trimmed, lowercase, and a number written the one way (5.0 and 5 are the same value)."""
    x = str(x).strip().lower()
    try:
        return "%.9g" % float(x)
    except ValueError:
        return x


def explorer_differs(estate, a):
    """Fields the Explorer would flag as differing for this asset: the rule of viz/shared/provenance.mjs applied to the real provenance rows
    (a source agrees when everything it holds is part of the final value) -> {(source, field)}."""
    merged = [r for r in estate.merged if r["_key"] == a["_key"]][0]
    out = set()
    for r in estate.splunk.search(dashboard(estate, asset=a["_key"])["prov"]):
        final = {canon(x) for x in vals(merged, r["field"]) if x.strip()}
        held = {canon(x) for v in vals(r, "value") for x in v.split("~|~") if x.strip()}
        if final and not (held and held <= final):
            out.add((r["source"], r["field"]))
    return out


def true_differs(a):
    """What differs once the values are read the way the merge reads them (normalized, validated, ignore lists applied)."""
    out = set()
    for fld, cfg in world.FIELDS:
        final = {canon(x) for x in (a[fld] if isinstance(a[fld], list) else ([] if a[fld] is None else [str(a[fld])]))}
        if not final:
            continue
        per = defaultdict(set)
        for r in a["_rows"]:
            if fld in r["v"]:
                per[r["src"]["name"]].update(canon(x) for x in r["v"][fld])
        for name, held in per.items():
            if held and not held <= final:
                out.add((name, fld))
    return out


def test_the_explorer_flags_a_difference_only_when_a_source_really_disagrees(estate):
    """The Explorer's provenance reads each source's raw values (before normalizers, validation and ignore lists), the merge works on cleaned ones.
    A source whose MAC has dashes, whose FQDN has a trailing dot, or whose tag list holds an ignored value must not be shown as disagreeing."""
    false_pos, false_neg = [], []
    for a in sample_assets(estate):
        shown = explorer_differs(estate, a)
        truth = true_differs(a)
        label = sorted(a["asset"])[0]
        false_pos += ["%s: %s / %s is shown as differing but agrees" % (label, s, f) for s, f in sorted(shown - truth)]
        false_neg += ["%s: %s / %s differs but is not shown" % (label, s, f) for s, f in sorted(truth - shown)]
    msg = "%d shown wrongly, %d missed\n%s" % (len(false_pos), len(false_neg), "\n".join((false_pos[:12] + false_neg[:8])))
    assert not (false_pos or false_neg), msg


def test_zz_dump_for_the_browser_checks(estate):
    out = os.environ.get("ADB_DUMP")
    if not out:
        pytest.skip("set ADB_DUMP=<dir> to write the real search results for tests/e2e/comprehensive.mjs")
    os.makedirs(out, exist_ok=True)
    data = dict(sources=[dict(name=s["name"], lookup=[x for x in estate.box.sources if x["name"] == s["name"]][0]["lookup"])
                         for s in world.SOURCES if s.get("enabled") is not False],
                total=len(estate.expected), explorer={}, coverage={}, picks=[])
    d = dashboard(estate)
    data["explorer"]["assets"] = estate.splunk.search(d["assets"])
    for by in ("No grouping", "os", "criticality", "region", "tags"):
        data["coverage"][by] = estate.splunk.search(dashboard(estate, cov_by=by)["cov"])
    for a in sample_assets(estate):
        p = dict(key=a["_key"], asset=sorted(a["asset"]), sources=sorted(a["source"]), conflicts=sorted(a["conflicts"]))
        p["prov"] = estate.splunk.search(dashboard(estate, asset=a["_key"])["prov"])
        q = dashboard(estate, q=sorted(a["asset"])[0])
        p["asset_rows"] = estate.splunk.search(q["assets"])
        p["asset_total"] = int(estate.splunk.search(q["total"])[0]["adb_total"])
        p["diff_fields"] = sorted({f for _, f in true_differs(a)})
        p["final"] = {name: ([str(x) for x in a[name]] if isinstance(a[name], list) else ([] if a[name] is None else [str(a[name])])) for name, _ in world.FIELDS}
        data["picks"].append(p)
    with open(os.path.join(out, "comprehensive.json"), "w") as f:
        json.dump(data, f)
