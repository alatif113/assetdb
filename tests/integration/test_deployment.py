"""The deployed app has the right version and registers its search command, collection and lookup."""
import json

from conftest import APP


def entry(resp):
    assert resp.status_code == 200, "%s -> %s %s" % (resp.url, resp.status_code, resp.text[:300])
    return resp.json()["entry"][0]


def test_app_installed_enabled_and_at_packaged_version(splunk, package_version):
    content = entry(splunk.get("/services/apps/local/%s" % APP))["content"]
    assert not content["disabled"], "app is disabled"
    assert content["version"] == package_version


def test_kvstore_is_ready(splunk):
    status = entry(splunk.get("/services/kvstore/status"))["content"]["current"]["status"]
    assert status == "ready"


def test_adbmerge_is_registered_with_python3(splunk):
    content = entry(splunk.get("/servicesNS/nobody/%s/configs/conf-commands/adbmerge" % APP))["content"]
    assert content["filename"] == "adbmerge.py"
    assert content["python.version"] == "python3"
    assert str(content["chunked"]).lower() in ("1", "true")


def test_adbmerge_runs_and_merges_a_trivial_search(splunk):
    rows = splunk.search(
        '| makeresults count=2 | streamstats count as n '
        '| eval _key=if(n=1, mvappend("k1","k2"), mvappend("k2","k3")) | fields _key '
        '| adbmerge max_keys=25 | stats dc(asset) as dc_asset values(asset) as asset')
    assert rows, "no results from adbmerge"
    assert sorted(rows[0]["asset"]) == ["k1", "k2", "k3"], rows


def test_adbmerge_requires_max_keys(splunk):
    # /export swallows search errors, so run a normal job and read its messages
    base = splunk.mgmt + "/servicesNS/nobody/%s/search/jobs" % APP
    r = splunk.s.post(base, data={"search": "| makeresults | eval _key=\"a\" | adbmerge",
                                  "exec_mode": "blocking", "output_mode": "json"}, timeout=120)
    sid = r.json().get("sid") if r.status_code < 300 else None
    assert sid, r.text[:300]
    content = splunk.s.get("%s/%s" % (base, sid), params={"output_mode": "json"}, timeout=60).json()["entry"][0]["content"]
    messages = json.dumps(content.get("messages", {})) + " " + json.dumps(content.get("isFailed"))
    assert "max_keys" in messages, messages


def test_kv_collection_and_lookup_definition_exist(splunk):
    coll = entry(splunk.get("/servicesNS/nobody/%s/storage/collections/config/assetdb" % APP))
    assert coll["name"] == "assetdb"
    lookup = entry(splunk.get("/servicesNS/nobody/%s/data/transforms/lookups/assetdb" % APP))["content"]
    assert lookup["external_type"] == "kvstore"
    assert lookup["collection"] == "assetdb"
