"""The adb_enrich* macros against a real Splunk, using a temporary merged collection instead of assetdb."""
import re

import pytest

from sandbox import Sandbox, field


@pytest.fixture
def merged(splunk, run_id, request):
    box = Sandbox(splunk, run_id, "enr")
    box.fields = [field("mac", key_field="1", normalizer="mac"), field("ip", key_field="1", key_scope="scoped"), field("owner", field_type="single")]
    box.add_source("paris", [{"mac": "aa:bb:cc:dd:ee:01", "ip": "10.0.0.5", "owner": "pierre"}], scope="paris")
    box.add_source("dallas", [{"mac": "aa:bb:cc:dd:ee:02", "ip": "10.0.0.5", "owner": "dana"}], scope="dallas")
    # adb_enrich_outputs is rewritten by the Configure page for the fields of the installation, so the temporary collection needs those columns too
    outputs = splunk.get("/servicesNS/nobody/assetdb/data/macros/adb_enrich_outputs").json()["entry"][0]["content"]["definition"]
    builtin = {"_key", "source", "source_lookup", "last_seen"}
    extra = [c for c in re.findall(r"(\w+) AS asset_", outputs) if c not in builtin]
    box.run(columns=sorted(set(extra) | {f["name"] for f in box.fields}))
    yield box
    box.close()


def enrich(box, macro_call):
    rows = box.splunk.search("| makeresults | %s" % macro_call)
    return rows[0]


def test_adb_enrich_with_adds_the_asset_columns_for_any_key(merged):
    row = enrich(merged, 'eval m="AA:BB:CC:DD:EE:01" | `adb_enrich_with(m, %s)`' % merged.kv)
    assert row.get("asset_id") and row["asset_source"] == "paris", row     # matched case-insensitively
    assert "adb_lookup_key" not in row, "the helper field is removed"


def test_adb_enrich_mac_normalizes_before_matching(merged):
    row = enrich(merged, 'eval m="AABB.CCDD.EE02" | `adb_enrich_with(m, %s)`' % merged.kv)
    assert not row.get("asset_id"), "unnormalized value must not match through the plain macro"
    normalized = enrich(merged, 'eval m="AABB.CCDD.EE02" | `normalize_mac(m)` | `adb_enrich_with(m, %s)`' % merged.kv)
    assert normalized["asset_source"] == "dallas", normalized


def test_scoped_keys_are_looked_up_with_their_scope(merged):
    # adb_enrich_scoped targets assetdb; the same expression is checked against the temporary collection by hand
    row = enrich(merged, 'eval s="Dallas", k="10.0.0.5", adb_lookup_key=lower(s) . "|" . lower(k) | lookup %s asset AS adb_lookup_key OUTPUTNEW `adb_enrich_outputs`' % merged.kv)
    assert row["asset_source"] == "dallas", row
    assert row.get("asset_id")


def test_the_enrichment_macros_exist_and_are_exported(splunk):
    for name in ("adb_enrich(1)", "adb_enrich_with(2)", "adb_enrich_scoped(2)", "adb_enrich_mac(1)", "adb_enrich_ip(1)", "adb_enrich_host(1)", "adb_enrich_outputs"):
        r = splunk.get("/servicesNS/nobody/assetdb/data/macros/%s" % name.replace("(", "%28").replace(")", "%29"))
        assert r.status_code == 200, (name, r.status_code)
        assert r.json()["entry"][0]["acl"]["sharing"] == "global", name      # export = system shows up as global
