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
