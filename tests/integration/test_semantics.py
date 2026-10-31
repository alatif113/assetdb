"""Merge semantics checked against a real Splunk (temporary lookups and collection only)."""
import pytest

from sandbox import Sandbox, field


@pytest.fixture
def sandbox(splunk, run_id, request):
    box = Sandbox(splunk, run_id, request.node.name[:18].replace("[", "_").replace("]", "").replace("test_", ""))
    yield box
    box.close()


def only(rows):
    assert len(rows) == 1, rows
    return rows[0]


def test_fill_null_is_applied_after_the_merge_not_before(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single", fillnull="unknown")]
    # source a knows the owner, source b does not; filling before the merge would add "unknown" to the owner
    sandbox.add_source("a", [{"mac": "aa:01", "owner": "alice"}])
    sandbox.add_source("b", [{"mac": "aa:01", "owner": ""}, {"mac": "aa:02", "owner": ""}])
    rows = sandbox.run()
    by_mac = {r["mac"][0]: r for r in rows}
    assert by_mac["aa:01"]["owner"] == ["alice"]
    assert by_mac["aa:02"]["owner"] == ["unknown"]


def test_multivalue_trim_keeps_the_most_recent_values(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("ip", max_values="2")]
    rows = [{"_time": 1700000000 + i * 100, "mac": "aa:01", "ip": "10.0.0.%d" % (i + 1)} for i in range(5)]
    sandbox.add_source("a", rows, header=["_time", "mac", "ip"])
    r = only(sandbox.run())
    # the newest rows carry the highest octets; an alphabetical trim would keep .1 and .2 instead
    assert sorted(r["ip"]) == ["10.0.0.4", "10.0.0.5"], r


def test_normalizer_makes_differently_formatted_macs_match(sandbox):
    sandbox.fields = [field("mac", key_field="1", normalizer="mac", validation_type="mac"), field("owner", field_type="single")]
    sandbox.add_source("a", [{"mac": "AA-BB-CC-DD-EE-FF", "owner": "alice"}])
    sandbox.add_source("b", [{"mac": "aabb.ccdd.eeff", "owner": ""}, {"mac": "garbage", "owner": "ghost"}])
    rows = sandbox.run()
    assert len(rows) == 1, rows      # "garbage" fails the MAC validation, so that row has no key and is dropped
    assert rows[0]["mac"] == ["aa:bb:cc:dd:ee:ff"] and rows[0]["owner"] == ["alice"]


def test_keep_original_case_matches_case_insensitively_but_stores_the_original(sandbox):
    sandbox.fields = [field("host", key_field="1", case_sensitive="0", keep_case="1")]
    sandbox.add_source("a", [{"host": "HOST-A"}])
    sandbox.add_source("b", [{"host": "host-a"}])
    r = only(sandbox.run())
    assert sorted(r["host"]) == ["HOST-A", "host-a"], r      # one asset, both spellings kept
    assert r["asset"] == ["host-a"], r                       # matched on the lowercased key


def test_typed_validation_drops_invalid_values_but_keeps_the_asset(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("ip", validation_type="ipv4")]
    sandbox.add_source("a", [{"mac": "m1", "ip": "10.0.0.1|999.1.1.1|not-an-ip"}])
    r = only(sandbox.run())
    assert r["ip"] == ["10.0.0.1"], r


def test_ignore_exact_regex_cidr_and_the_global_list(sandbox):
    sandbox.general = {"ignore_values": '["n/a"]'}
    sandbox.fields = [field("mac", key_field="1"),
                      field("ip", case_sensitive="0", ignore_values='["unknown", "re:^169\\\\.254\\\\.", "cidr:10.0.0.0/8"]')]
    sandbox.add_source("a", [{"mac": "m1", "ip": "Unknown|10.1.2.3|169.254.9.9|192.168.1.5|N/A|8.8.8.8"}])
    r = only(sandbox.run())
    assert sorted(r["ip"]) == ["192.168.1.5", "8.8.8.8"], r


def test_a_field_can_opt_out_of_the_global_ignore_list(sandbox):
    sandbox.general = {"ignore_values": '["n/a"]'}
    sandbox.fields = [field("mac", key_field="1"), field("note", ignore_values="[]", inherit_ignore="0")]
    sandbox.add_source("a", [{"mac": "m1", "note": "n/a|x"}])
    assert sorted(only(sandbox.run())["note"]) == ["n/a", "x"]


def test_allowed_sources_discard_values_from_other_sources(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single", allowed_sources="cmdb")]
    sandbox.add_source("cmdb", [{"mac": "m1", "owner": ""}])
    sandbox.add_source("edr", [{"mac": "m1", "owner": "from-edr"}])
    assert only(sandbox.run()).get("owner") in (None, [""], []), "edr must not provide the owner"


def test_earliest_sum_and_numeric_max(sandbox):
    sandbox.fields = [field("mac", key_field="1"),
                      field("first", field_type="single", merge_method="earliest"),
                      field("hits", field_type="single", merge_method="sum", value_type="number"),
                      field("score", field_type="single", merge_method="max", value_type="number")]
    sandbox.add_source("a", [{"_time": 1700000300, "mac": "m1", "first": "newer", "hits": 5, "score": 9},
                             {"_time": 1700000100, "mac": "m1", "first": "oldest", "hits": 7, "score": 10}],
                       header=["_time", "mac", "first", "hits", "score"])
    sandbox.add_source("b", [{"_time": 1700000200, "mac": "m1", "first": "middle|pipe", "hits": 1, "score": 100}],
                       header=["_time", "mac", "first", "hits", "score"])
    r = only(sandbox.run())
    assert r["first"] == ["oldest"], r
    assert r["hits"] == ["13"], r
    assert r["score"] == ["100"], r        # numeric max: 100 > 10 > 9 (a text max would pick "9")


# --- source options -----------------------------------------------------------------------

def test_disabled_source_is_ignored(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single")]
    sandbox.add_source("a", [{"mac": "m1", "owner": "alice"}])
    sandbox.add_source("b", [{"mac": "m2", "owner": "bob"}], enabled=False)
    assert [r["mac"] for r in sandbox.run()] == [["m1"]]


def test_column_mapping_renames_columns_per_source(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single")]
    sandbox.add_source("a", [{"mac": "m1", "owner": "alice"}])
    sandbox.add_source("b", [{"HW Addr": "m1", "Who": "bob-ignored", "Contact": "carol"}], columns={"mac": "HW Addr", "owner": "Who"})
    rows = sandbox.run()
    assert len(rows) == 1, rows         # source b's "HW Addr" column became the mac key, so it merged with source a
    assert rows[0]["owner"] in (["alice"], ["bob-ignored"]), rows


def test_row_filter_max_age_and_time_column_apply_to_one_source(sandbox):
    import time
    now = int(time.time())
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "keep-a", "status": "active"}, {"mac": "drop-a", "status": "decommissioned"}], filter='status!="decommissioned"')
    sandbox.add_source("b", [{"mac": "fresh-b", "seen": now - 86400}, {"mac": "stale-b", "seen": now - 90 * 86400}],
                       max_age="30d", time_field="seen")
    sandbox.add_source("c", [{"mac": "old-c", "status": "decommissioned", "seen": 100}])   # no filter, no max age: untouched
    macs = sorted(r["mac"][0] for r in sandbox.run())
    assert macs == ["fresh-b", "keep-a", "old-c"], macs


def test_enrich_sources_add_data_but_never_create_or_link_assets(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("ip", key_field="1"), field("vulns", field_type="single", merge_method="max", value_type="number")]
    sandbox.add_source("cmdb", [{"mac": "m1", "ip": "10.0.0.1"}, {"mac": "m2", "ip": "10.0.0.2"}])
    sandbox.add_source("scan", [{"mac": "", "ip": "10.0.0.1", "vulns": 7},          # attaches to the m1 asset
                                {"mac": "m1", "ip": "10.0.0.2", "vulns": 99},       # ambiguous: would link m1 and m2
                                {"mac": "", "ip": "10.9.9.9", "vulns": 5}],         # matches nothing: no new asset
                       role="enrich")
    rows = {r["mac"][0]: r for r in sandbox.run()}
    assert sorted(rows) == ["m1", "m2"], rows
    assert rows["m1"]["vulns"] == ["7"], rows["m1"]
    assert not rows["m2"].get("vulns"), rows["m2"]
