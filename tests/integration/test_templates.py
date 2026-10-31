"""The source-lookup templates on a real Splunk: they parse, and the add-on free one produces a usable source lookup."""
import pytest

from conftest import APP

NAMES = ["assetdb-src-splunk-hosts", "assetdb-src-dhcp-cim", "assetdb-src-vulnerabilities-cim", "assetdb-src-ad-computers"]


def saved_search(splunk, name):
    r = splunk.get("/servicesNS/nobody/%s/saved/searches/%s" % (APP, name))
    assert r.status_code == 200, (name, r.status_code)
    return r.json()["entry"][0]["content"]


def test_templates_are_shipped_disabled(splunk):
    for name in NAMES:
        content = saved_search(splunk, name)
        assert str(content["disabled"]) in ("1", "True", "true"), name
        assert str(content["is_scheduled"]) in ("0", "False", "false"), name


@pytest.mark.parametrize("name", [n for n in NAMES if n != "assetdb-src-ad-computers"])
def test_template_searches_parse(splunk, name):
    # the AD template needs the ldapsearch command of an add-on, so only the others can be parsed here
    r = splunk.post("/services/search/v2/parser", {"q": saved_search(splunk, name)["search"]})
    # a CIM template parses as far as the data model lookup; the model itself belongs to the CIM add-on, which this server does not have
    assert r.status_code == 200 or "Data model" in r.text and "was not found" in r.text, (name, r.text[:300])


def test_the_hosts_template_builds_a_source_lookup_with_host_names(splunk, run_id):
    spl = saved_search(splunk, "assetdb-src-splunk-hosts")["search"]
    lookup = "adbtest_%s_hosts.csv" % run_id
    spl = spl.replace("assetdb_src_splunk_hosts.csv", lookup)
    try:
        splunk.search(spl)
        rows = splunk.search("| inputlookup %s | head 5" % lookup)
        assert rows and all(r.get("nt_host") for r in rows), rows
        assert all(r.get("source_lookup") == lookup for r in rows), "output_adb_lookup adds the source_lookup column"
    finally:
        splunk.delete("/servicesNS/nobody/%s/data/lookup-table-files/%s" % (APP, lookup))
