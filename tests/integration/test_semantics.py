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
