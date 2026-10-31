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


# --- key quality ----------------------------------------------------------------------------

def test_blocklisted_values_never_link_assets_but_stay_in_the_data(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("ip", key_field="1")]
    sandbox.add_source("a", [{"mac": "m1", "ip": "0.0.0.0"}, {"mac": "m2", "ip": "0.0.0.0"}, {"mac": "m3", "ip": "10.0.0.3"}])
    rows = {r["mac"][0]: r for r in sandbox.run()}
    assert sorted(rows) == ["m1", "m2", "m3"], rows             # not chained through 0.0.0.0
    assert rows["m1"]["ip"] == ["0.0.0.0"], rows["m1"]            # the placeholder is still stored on the asset
    assert rows["m1"]["asset"] == ["m1"], rows["m1"]


def test_a_widely_shared_key_is_skipped_by_the_frequency_guard(sandbox):
    sandbox.general = {"max_key_share": "5", "key_blocklist": "[]"}
    sandbox.fields = [field("mac", key_field="1"), field("ip", key_field="1")]
    rows = [{"mac": "m%d" % i, "ip": "10.0.0.1"} for i in range(8)]      # eight hosts behind one NAT address
    sandbox.add_source("a", rows)
    out = sandbox.run()
    assert sorted(r["mac"][0] for r in out) == ["m%d" % i for i in range(8)], out
    assert all(r["asset"] == [r["mac"][0]] for r in out)


def test_scoped_keys_keep_overlapping_addresses_in_different_sites_apart(sandbox):
    sandbox.fields = [field("ip", key_field="1", key_scope="scoped"), field("mac", key_field="1"), field("owner", field_type="single")]
    sandbox.add_source("paris", [{"ip": "10.0.0.5", "mac": "", "owner": "pierre"}], scope="Paris")
    sandbox.add_source("dallas", [{"ip": "10.0.0.5", "mac": "", "owner": "dana"}], scope="Dallas")
    sandbox.add_source("dallas2", [{"ip": "", "mac": "aa:01", "owner": ""}, {"ip": "10.0.0.5", "mac": "aa:01", "owner": ""}], scope="Dallas")
    rows = sandbox.run()
    by_owner = {r["owner"][0]: r for r in rows if r.get("owner")}
    assert sorted(by_owner) == ["dana", "pierre"], rows
    assert by_owner["pierre"]["scope"] == ["paris"] and by_owner["pierre"]["asset"] == ["paris|10.0.0.5"]
    assert by_owner["dana"]["scope"] == ["dallas"] and sorted(by_owner["dana"]["asset"]) == ["aa:01", "dallas|10.0.0.5"]   # the global mac still links within the site


def test_scope_column_is_used_when_a_source_has_no_fixed_scope(sandbox):
    sandbox.general = {"scope_field": "site"}
    sandbox.fields = [field("ip", key_field="1", key_scope="scoped")]
    sandbox.add_source("a", [{"ip": "10.0.0.5", "site": "East"}, {"ip": "10.0.0.5", "site": "West"}, {"ip": "10.0.0.5", "site": "east"}])
    rows = sandbox.run()
    assert sorted(r["asset"][0] for r in rows) == ["east|10.0.0.5", "west|10.0.0.5"], rows


# --- run history and the safety switch -------------------------------------------------------

def test_every_run_is_recorded_with_its_counters(sandbox):
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m1"}, {"mac": "m2"}, {"mac": ""}])
    sandbox.run()
    sandbox.run()
    runs = sandbox.runs_rows()
    assert [r["status"] for r in runs] == ["ok", "ok"], runs
    first = runs[0]
    # rows_in counts what reached the merge command: rows with a key, identical key sets combined (the keyless row never gets there)
    assert (first["assets_out"], first["rows_in"], first["null_keys"]) == ("2", "2", "0"), first
    assert first.get("assets_prev") in (None, ""), "no previous run to compare with"
    assert runs[1]["assets_prev"] == "2"


def test_a_collapsed_run_is_blocked_and_assetdb_is_left_as_it_was(sandbox):
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m%d" % i} for i in range(10)])
    assert len(sandbox.run()) == 10
    sandbox.rewrite_source("a", [{"mac": "m0"}, {"mac": "m1"}])            # 2 < 50% of 10
    assert len(sandbox.run()) == 10, "the asset database must not be overwritten"
    runs = sandbox.runs_rows()
    assert [r["status"] for r in runs] == ["ok", "blocked_low_count"], runs
    assert runs[1]["assets_out"] == "2" and runs[1]["assets_prev"] == "10"
    sandbox.rewrite_source("a", [{"mac": "m%d" % i} for i in range(6)])     # 6 >= 50% of the last *successful* run (10)
    assert len(sandbox.run()) == 6


def test_the_safety_switch_can_be_turned_off(sandbox):
    sandbox.general = {"min_ratio": "0"}
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m%d" % i} for i in range(10)])
    sandbox.run()
    sandbox.rewrite_source("a", [{"mac": "m0"}])
    assert len(sandbox.run()) == 1


def test_an_empty_run_never_wipes_the_asset_database(sandbox):
    sandbox.general = {"min_ratio": "0"}      # even with the ratio check off, nothing at all must not erase everything
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m1"}, {"mac": "m2"}])
    assert len(sandbox.run()) == 2
    sandbox.rewrite_source("a", [{"mac": ""}], header=["mac"])               # every row has no key
    assert len(sandbox.run()) == 2
    assert sandbox.runs_rows()[-1]["status"] == "empty"


def test_run_history_is_bounded(sandbox):
    sandbox.general = {"runs_to_keep": "3"}
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m1"}])
    for _ in range(6):
        sandbox.run()
    assert len(sandbox.runs_rows()) == 3


# --- overflow review and conflicts ---------------------------------------------------------------

def test_overflow_clusters_are_listed_for_review_and_kept_out_of_assetdb(sandbox):
    sandbox.general = {"max_keys": "3", "max_key_share": "0", "key_blocklist": "[]"}
    sandbox.fields = [field("mac", key_field="1"), field("ip", key_field="1")]
    rows = [{"mac": "big%d" % i, "ip": "10.0.0.1"} for i in range(5)] + [{"mac": "ok1", "ip": "10.0.0.9"}]   # five hosts share one ip: 6 keys > 3
    sandbox.add_source("a", rows)
    out = sandbox.run()
    assert [r["mac"][0] for r in out] == ["ok1"], out
    overflow = sandbox.overflow_rows()
    assert len(overflow) == 1, overflow
    assert overflow[0]["cluster_keys"] == "6" and overflow[0]["cluster_rows"] == "5"
    assert len(overflow[0]["asset"]) == 6 if isinstance(overflow[0]["asset"], list) else False
    sandbox.rewrite_source("a", [{"mac": "ok1", "ip": "10.0.0.9"}])
    sandbox.general["min_ratio"] = "0"
    sandbox.run()
    assert sandbox.overflow_rows() == [], "a run without overflow clears the old list"


def test_conflicting_values_across_sources_are_flagged(sandbox):
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single", track_conflicts="1"),
                      field("os", field_type="single", track_conflicts="1"), field("note", field_type="single")]
    sandbox.add_source("a", [{"mac": "m1", "owner": "alice", "os": "linux", "note": "x"}, {"mac": "m2", "owner": "bob", "os": "linux", "note": "x"}])
    sandbox.add_source("b", [{"mac": "m1", "owner": "carol", "os": "linux", "note": "y"}, {"mac": "m2", "owner": "bob", "os": "linux", "note": "y"}])
    rows = {r["mac"][0]: r for r in sandbox.run()}
    assert rows["m1"]["conflicts"] == ["owner"], rows["m1"]
    assert not rows["m2"].get("conflicts"), rows["m2"]


# --- merge preview ----------------------------------------------------------------------------------

def test_preview_summarises_the_merge_without_writing_anything(sandbox):
    sandbox.general = {"max_keys": "3", "max_key_share": "0", "key_blocklist": "[]"}
    sandbox.fields = [field("mac", key_field="1"), field("ip", key_field="1")]
    rows = [{"mac": "big%d" % i, "ip": "10.0.0.1"} for i in range(4)] + [{"mac": "m1", "ip": "10.0.0.9"}, {"mac": "m1", "ip": "10.0.0.10"}, {"mac": "", "ip": ""}]
    sandbox.add_source("a", rows)
    sandbox.create_kv(["mac", "ip"])
    result = sandbox.preview()
    summary = result["summary"][0]
    assert (summary["assets"], summary["overflow_clusters"]) == ("1", "1"), summary          # m1 + its two ips is one asset (two key sets); the big cluster overflows
    assert result["current"][0]["assets"] == "0", "nothing was written: the temporary collection is still empty"
    assert sandbox.rows() == [] and sandbox.overflow_rows() == [] and sandbox.runs_rows() == []
    assert result["clusters"][0]["keys"] == "3"
    assert [r["source"] for r in result["sources"]] == ["a"]


# --- explain: which source supplied what --------------------------------------------------------------

def test_explain_lists_the_source_rows_behind_an_asset_after_normalization(sandbox):
    sandbox.fields = [field("mac", key_field="1", normalizer="mac"), field("owner", field_type="single"), field("os", field_type="single")]
    sandbox.add_source("cmdb", [{"mac": "AA-BB-CC-DD-EE-01", "owner": "alice", "os": ""}, {"mac": "aa:bb:cc:dd:ee:99", "owner": "someone else", "os": ""}])
    sandbox.add_source("edr", [{"mac": "aabb.ccdd.ee01", "owner": "", "os": "linux"}])
    sandbox.add_source("scan", [{"mac": "aabbccddee01", "owner": "", "os": "ubuntu"}], role="enrich")
    asset = [r for r in sandbox.run() if r["mac"] == ["aa:bb:cc:dd:ee:01"]][0]
    rows = sandbox.explain(asset["asset"])
    by_source = {r["source"]: r for r in rows}
    assert sorted(by_source) == ["cmdb", "edr", "scan"], rows        # the unrelated cmdb row is not listed
    assert by_source["cmdb"]["owner"] == "alice" and by_source["edr"]["os"] == "linux"
    assert by_source["scan"]["role"] == "enrich only" and by_source["cmdb"]["role"] == "authoritative"
    assert by_source["edr"]["mac"] == "aa:bb:cc:dd:ee:01", "shown as the merge sees it, after the normalizer"


# --- change history ------------------------------------------------------------------------------------

def test_change_history_records_added_removed_and_changed_assets(sandbox):
    sandbox.general = {"change_history": "kv", "min_ratio": "0"}
    sandbox.fields = [field("mac", key_field="1"), field("owner", field_type="single"), field("os", field_type="single")]
    sandbox.add_source("a", [{"mac": "m1", "owner": "alice", "os": "linux"}, {"mac": "m2", "owner": "bob", "os": "linux"}, {"mac": "m3", "owner": "carol", "os": "linux"}])
    sandbox.run()
    first = sandbox.change_rows()
    assert sorted(r["change"] for r in first) == ["added", "added", "added"], first          # a first run adds everything
    sandbox.rewrite_source("a", [{"mac": "m1", "owner": "alice", "os": "linux"},               # unchanged
                                 {"mac": "m2", "owner": "dave", "os": "windows"},              # owner and os changed
                                 {"mac": "m4", "owner": "erin", "os": "linux"}])               # new; m3 is gone
    sandbox.run()
    later = [r for r in sandbox.change_rows() if r["run_time"] != first[0]["run_time"]]
    by_change = {}
    for r in later:
        by_change.setdefault(r["change"], []).append(r)
    assert sorted(by_change) == ["added", "changed", "removed"], later
    assert by_change["added"][0]["asset"] == "m4" or by_change["added"][0]["asset"] == ["m4"]
    assert sorted(by_change["changed"][0]["changed_fields"]) == ["os", "owner"], by_change["changed"]
    assert len(later) == 3, "the unchanged asset is not recorded"
    sandbox.run()                                                                               # nothing changed
    assert len(sandbox.change_rows()) == len(first) + 3


def test_change_history_is_off_by_default_and_bounded(sandbox):
    sandbox.fields = [field("mac", key_field="1")]
    sandbox.add_source("a", [{"mac": "m1"}])
    sandbox.run()
    assert sandbox.change_rows() == []
    box_rows = 100
    sandbox.general = {"change_history": "kv", "history_rows": str(box_rows)}
    sandbox.rewrite_source("a", [{"mac": "n%d" % i} for i in range(130)])
    sandbox.run()
    assert len(sandbox.change_rows()) == box_rows
