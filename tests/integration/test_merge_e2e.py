"""End-to-end merge on the live server using a TEMPORARY KV collection and CSV lookups.

The real `assetdb` collection and assetdb.conf are never touched: the generated search is
produced by the app's own JS generator (makeMergeSearch) and its final outputlookup is
redirected to adbtest_<runid>.
"""
import json
import os
import subprocess

import pytest

from conftest import APP, ROOT

FIELDS = ["mac", "nt_host", "ip", "owner"]


def _field(name, **kw):
    content = dict(key_field="0", case_sensitive="1", ignore_values="[]", fillnull="", validation="",
                   field_type="multivalue", merge_method="latest", merge_order="", max_values="10",
                   eval_expression="")
    content.update(kw)
    return {"name": name, "content": content}


def _csv_search(path, rows):
    # source_lookup mirrors what the app's output_adb_lookup macro adds to real source lookups
    data = "\n".join([",".join(FIELDS + ["source_lookup"])] + [",".join(tuple(r) + (path,)) for r in rows])
    return '| makeresults format=csv data="%s" | fields - _time | outputlookup %s' % (data, path)


class Env(object):
    def __init__(self, splunk, run_id):
        self.splunk = splunk
        self.kv = "adbtest_%s" % run_id
        self.files = ["adbtest_%s_%s.csv" % (run_id, n) for n in "abcd"]
        self.created = []  # cleanup callables, run in reverse

    def cleanup(self):
        for fn in reversed(self.created):
            try:
                fn()
            except Exception as e:  # keep cleaning even if one step fails
                print("cleanup warning:", e)

    def fieldarray(self):
        lookups = [{"name": "src_" + f.split("_")[-1].split(".")[0], "lookup": f} for f in self.files]
        return [
            {"name": "general", "content": {"lookups": json.dumps(lookups)}},
            _field("mac", key_field="1", case_sensitive="0"),
            _field("nt_host", key_field="1", case_sensitive="0"),
            _field("ip"),
            _field("owner", field_type="single"),
        ]

    def merge_spl(self):
        out = subprocess.check_output(
            ["node", os.path.join(ROOT, "tests", "integration", "gen_spl.js"), self.kv],
            input=json.dumps(self.fieldarray()).encode(), cwd=ROOT)
        return out.decode()


@pytest.fixture(scope="module")
def env(splunk, run_id):
    e = Env(splunk, run_id)
    ns = "/servicesNS/nobody/%s" % APP
    try:
        # temporary KV collection + lookup definition
        r = splunk.post(ns + "/storage/collections/config", {"name": e.kv})
        assert r.status_code in (200, 201), r.text
        e.created.append(lambda: splunk.delete(ns + "/storage/collections/config/" + e.kv))
        r = splunk.post(ns + "/data/transforms/lookups", {
            "name": e.kv, "external_type": "kvstore", "collection": e.kv,
            "fields_list": ",".join(["_key", "asset", "source", "source_lookup", "last_seen"] + FIELDS)})
        assert r.status_code in (200, 201), r.text
        e.created.append(lambda: splunk.delete(ns + "/data/transforms/lookups/" + e.kv))
        # the generated search also keeps a run history: give the temporary collection its own
        r = splunk.post(ns + "/storage/collections/config", {"name": e.kv + "_runs", "field.run_time": "number", "field.assets_out": "number"})
        assert r.status_code in (200, 201), r.text
        e.created.append(lambda: splunk.delete(ns + "/storage/collections/config/" + e.kv + "_runs"))
        r = splunk.post(ns + "/data/transforms/lookups", {
            "name": e.kv + "_runs", "external_type": "kvstore", "collection": e.kv + "_runs",
            "fields_list": "_key,run_time,status,assets_out,assets_prev,rows_in,null_keys,overflow_assets,enrich_unmatched,enrich_ambiguous,junk_keys,junk_rows,min_ratio"})
        assert r.status_code in (200, 201), r.text
        e.created.append(lambda: splunk.delete(ns + "/data/transforms/lookups/" + e.kv + "_runs"))

        mega = "|".join("mega%02d" % i for i in range(26))  # 26 keys > max_keys=25
        data = {
            0: [("aa:aa:aa:aa:aa:01", "HOST-A", "10.1.1.1", "alice")],
            1: [("aa:aa:aa:aa:aa:01", "HOST-B", "10.1.1.2", "bob")],          # shares mac with a
            2: [("", "host-b", "10.1.1.3", "carol"), ("", "", "10.9.9.9", "nokeys")],  # shares host (case-folded) with b; last row has no keys
            3: [("bb:bb:bb:bb:bb:02", "host-d", "10.2.2.2", "dave"), (mega, "", "10.3.3.3", "mega")],
        }
        for i, fname in enumerate(e.files):
            splunk.search(_csv_search(fname, data[i]))
            e.created.append(lambda f=fname: splunk.delete(ns + "/data/lookup-table-files/" + f))
        yield e
    finally:
        e.cleanup()


def _norm(v):
    return v if isinstance(v, list) else ([] if v in (None, "") else [v])


def run_merge(env):
    env.splunk.search(env.merge_spl())
    rows = env.splunk.search("| inputlookup %s | table _key asset nt_host mac ip owner source_lookup" % env.kv)
    for r in rows:
        for k in ("asset", "nt_host", "mac", "ip", "owner", "source_lookup"):
            r[k] = sorted(_norm(r.get(k)))
    return sorted(rows, key=lambda r: r["_key"])


def test_merge_results(env):
    rows = run_merge(env)
    # cluster {a,b,c} (mac + case-folded host, transitive) and cluster {d}; the overflow
    # cluster (26 keys > max_keys) and the no-key row are dropped
    assert len(rows) == 2, json.dumps(rows, indent=1)

    transitive = [r for r in rows if "host-a" in r["nt_host"]]
    assert len(transitive) == 1
    t = transitive[0]
    assert t["nt_host"] == ["host-a", "host-b"]          # lowercased because case_sensitive=0
    assert t["ip"] == ["10.1.1.1", "10.1.1.2", "10.1.1.3"]
    assert len(t["source_lookup"]) == 3                  # a, b and c all contributed

    d = [r for r in rows if r["nt_host"] == ["host-d"]]
    assert len(d) == 1 and d[0]["mac"] == ["bb:bb:bb:bb:bb:02"]

    assert not any("10.3.3.3" in r["ip"] for r in rows), "overflow cluster must be dropped"

    assert not any("10.9.9.9" in r["ip"] for r in rows), "row without keys must be dropped"


def test_merge_is_idempotent(env):
    first = [r["_key"] for r in run_merge(env)]
    second = [r["_key"] for r in run_merge(env)]
    assert first == second and len(first) == 2
