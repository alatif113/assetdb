"""Helper for live merge-semantics tests: temporary CSV source lookups and a temporary KV collection.

The generated search comes from the app's own JS generator (tests/integration/gen_spl.js); its final
outputlookup is redirected to the temporary collection, so the real `assetdb` is never touched.
"""
import json
import os
import subprocess

from conftest import APP, ROOT


def field(name, **kw):
    content = dict(key_field="0", case_sensitive="1", ignore_values="[]", fillnull="", validation="",
                   field_type="multivalue", merge_method="latest", merge_order="", max_values="10",
                   eval_expression="")
    content.update(kw)
    return {"name": name, "content": content}


class Sandbox(object):
    def __init__(self, splunk, run_id, tag):
        self.splunk = splunk
        self.kv = "adbtest_%s_%s" % (tag, run_id)
        self.prefix = "adbtest_%s_%s_" % (tag, run_id)
        self.sources = []  # (name, lookup file)
        self.fields = []
        self.general = {}
        self._cleanup = []
        self.ns = "/servicesNS/nobody/%s" % APP

    # -- setup -----------------------------------------------------------------------------
    def create_kv(self, columns):
        r = self.splunk.post(self.ns + "/storage/collections/config", {"name": self.kv})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/storage/collections/config/" + self.kv))
        r = self.splunk.post(self.ns + "/data/transforms/lookups", {
            "name": self.kv, "external_type": "kvstore", "collection": self.kv,
            "fields_list": ",".join(["_key", "asset", "source", "source_lookup", "last_seen", "scope", "conflicts"] + columns)})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/data/transforms/lookups/" + self.kv))
        self.runs = self.kv + "_runs"
        r = self.splunk.post(self.ns + "/storage/collections/config", {"name": self.runs, "field.run_time": "number", "field.assets_out": "number"})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/storage/collections/config/" + self.runs))
        r = self.splunk.post(self.ns + "/data/transforms/lookups", {
            "name": self.runs, "external_type": "kvstore", "collection": self.runs,
            "fields_list": "_key,run_time,status,assets_out,assets_prev,rows_in,null_keys,overflow_assets,enrich_unmatched,enrich_ambiguous,junk_keys,junk_rows,min_ratio"})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/data/transforms/lookups/" + self.runs))
        self.overflow = self.kv + "_overflow"
        r = self.splunk.post(self.ns + "/storage/collections/config", {"name": self.overflow})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/storage/collections/config/" + self.overflow))
        r = self.splunk.post(self.ns + "/data/transforms/lookups", {
            "name": self.overflow, "external_type": "kvstore", "collection": self.overflow,
            "fields_list": "_key,asset,cluster_keys,cluster_rows,source,source_lookup,run_time"})
        assert r.status_code in (200, 201), r.text
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/data/transforms/lookups/" + self.overflow))

    def add_source(self, name, rows, header=None, **options):
        """rows: list of dicts. A `source_lookup` column is added like output_adb_lookup does."""
        lookup = "%s%s.csv" % (self.prefix, name)
        header = header or sorted({k for r in rows for k in r})
        header = [h for h in header if h != "source_lookup"] + ["source_lookup"]
        lines = [",".join(header)] + [",".join(str(dict(r, source_lookup=lookup).get(h, "")) for h in header) for r in rows]
        spl = '| makeresults format=csv data="%s" | outputlookup %s' % ("\n".join(lines), lookup)
        self.splunk.search(spl)
        self._cleanup.append(lambda: self.splunk.delete(self.ns + "/data/lookup-table-files/" + lookup))
        entry = {"name": name, "lookup": lookup}
        entry.update(options)
        self.sources.append(entry)
        return lookup

    def rewrite_source(self, name, rows, header=None):
        """Replace the rows of an existing source lookup (same file, new content)."""
        entry = [e for e in self.sources if e["name"] == name][0]
        lookup = entry["lookup"]
        header = header or sorted({k for r in rows for k in r}) or ["mac"]
        header = [h for h in header if h != "source_lookup"] + ["source_lookup"]
        lines = [",".join(header)] + [",".join(str(dict(r, source_lookup=lookup).get(h, "")) for h in header) for r in rows]
        self.splunk.search('| makeresults format=csv data="%s" | outputlookup %s' % ("\n".join(lines), lookup))

    # -- run -------------------------------------------------------------------------------
    def fieldarray(self):
        general = {"lookups": json.dumps(self.sources)}
        general.update(self.general)
        return [{"name": "general", "content": general}] + self.fields

    def spl(self):
        out = subprocess.check_output(["node", os.path.join(ROOT, "tests", "integration", "gen_spl.js"), self.kv],
                                      input=json.dumps(self.fieldarray()).encode(), cwd=ROOT)
        return out.decode()

    def run(self, columns=None):
        if not self.splunk.get(self.ns + "/storage/collections/config/" + self.kv).ok:
            self.create_kv(columns or [f["name"] for f in self.fields])
        self.splunk.search(self.spl())
        return self.rows()

    def rows(self):
        rows = self.splunk.search("| inputlookup max=100000 %s" % self.kv)
        for r in rows:
            for k, v in list(r.items()):
                if isinstance(v, str) and k not in ("_key",):
                    r[k] = [v]
        return rows

    def overflow_rows(self):
        return self.splunk.search("| inputlookup max=100000 %s" % self.overflow)

    def runs_rows(self):
        rows = self.splunk.search("| inputlookup max=100000 %s | sort 0 run_time" % self.runs)
        return rows

    def close(self):
        for fn in reversed(self._cleanup):
            try:
                fn()
            except Exception as e:  # keep cleaning
                print("cleanup warning:", e)
