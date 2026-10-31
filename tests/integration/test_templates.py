"""The source-lookup templates on a real Splunk: they parse, and the add-on free one produces a usable source lookup."""
import json
import re

import pytest

from conftest import APP

NAMES = ["assetdb-src-splunk-hosts", "assetdb-src-dhcp-cim", "assetdb-src-vulnerabilities-cim", "assetdb-src-ad-computers",
         "assetdb-src-crowdstrike-devices", "assetdb-src-defender-machines", "assetdb-src-tenable-assets"]


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
    spl = saved_search(splunk, name)["search"]
    r = splunk.post("/services/search/v2/parser", {"q": spl if spl.lstrip().startswith("|") else "search " + spl})
    # a template parses as far as what only an add-on provides: the CIM data model, or the add-on's own macro
    missing_addon = ("Data model" in r.text and "was not found" in r.text) or "specifies a macro" in r.text
    assert r.status_code == 200 or missing_addon, (name, r.text[:300])


def test_the_hosts_template_builds_a_source_lookup_with_host_names(splunk, run_id):
    spl = saved_search(splunk, "assetdb-src-splunk-hosts")["search"]
    lookup = "adbtest_%s_hosts.csv" % run_id
    spl = spl.replace("assetdb_src_splunk_hosts.csv", lookup)
    try:
        splunk.search_job(spl)      # a job, not an export: the lookup file is complete when the job is done
        rows = splunk.search("| inputlookup %s | head 5" % lookup)
        assert rows and all(r.get("nt_host") for r in rows), rows
        assert all(r.get("source_lookup") == lookup for r in rows), "output_adb_lookup adds the source_lookup column"
    finally:
        splunk.delete("/servicesNS/nobody/%s/data/lookup-table-files/%s" % (APP, lookup))


# --- the add-on based templates run against events shaped like the documented schemas ------------------------
# The add-ons are not installed here, so the events below are built from the schemas the vendors document (Microsoft Machine resource, Tenable
# assets export in both layouts, CrowdStrike Hosts API names) and fed to the template through its own search text, with only the data source
# clause replaced. That proves the field handling, not that an add-on indexes exactly these names.
SAMPLES = {
    "assetdb-src-defender-machines": [
        {"id": "d1", "computerDnsName": "LAPTOP-01.corp.example.com", "lastIpAddress": "10.1.1.5", "osPlatform": "Windows11", "version": "23H2",
         "ipAddresses": [{"ipAddress": "10.1.1.5", "macAddress": "AABBCCDDEE01"}, {"ipAddress": "fe80::1", "macAddress": "AABBCCDDEE02"}]},
    ],
    "assetdb-src-tenable-assets": [
        {"id": "t1", "fqdns": ["web01.corp.example.com"], "hostnames": ["WEB01"], "ipv4s": ["10.2.2.2"], "mac_addresses": ["aa:bb:cc:dd:ee:10"], "operating_systems": ["Ubuntu 22.04"]},
        {"id": "t2", "network": {"fqdns": ["db01.corp.example.com"], "hostnames": ["db01"], "ipv4s": ["10.2.2.3"], "mac_addresses": ["aa:bb:cc:dd:ee:11"]}, "operating_systems": ["Windows Server 2019"]},
    ],
    "assetdb-src-crowdstrike-devices": [
        {"device_id": "c1", "hostname": "WIN10-001", "local_ip": "10.3.3.3", "external_ip": "203.0.113.9", "mac_address": "aa-bb-cc-dd-ee-20", "platform_name": "Windows", "os_version": "Windows 10", "machine_domain": "corp.example.com"},
        {"device_id": "c2", "host_name": "mac-02", "local_ip": "10.3.3.4", "platform_name": "Mac", "os_version": "Sonoma"},
    ],
}


def spl_string(value):
    return '"%s"' % json.dumps(value).replace("\\", "\\\\").replace('"', '\\"')


@pytest.mark.parametrize("name", sorted(SAMPLES))
def test_add_on_templates_transform_documented_events(splunk, run_id, name):
    template = saved_search(splunk, name)["search"]
    source = re.match(r'^(`cs_fd_get_index`|index=\* sourcetype="[^"]+")', template)
    assert source, name
    events = " ".join("| append [| makeresults | eval _raw=%s | spath]" % spl_string(e) for e in SAMPLES[name])
    spl = "| makeresults | where 1=0 %s%s" % (events, template[source.end():])
    lookup = "adbtest_%s_%s.csv" % (run_id, name.split("-")[-2])
    spl = re.sub(r"assetdb_src_\w+\.csv", lookup, spl)
    try:
        splunk.search_job(spl)
        rows = dict((r.get(next(k for k in r if k.endswith("_id"))), r) for r in splunk.search("| inputlookup %s" % lookup))
    finally:
        splunk.delete("/servicesNS/nobody/%s/data/lookup-table-files/%s" % (APP, lookup))
    def one(row, key):
        # source lookups hold multivalue fields as |-joined strings (that is what input_adb_lookup splits)
        value = row.get(key)
        value = value if isinstance(value, list) else ([] if value in (None, "") else [value])
        return [part for item in value for part in str(item).split("|")]
    if name == "assetdb-src-defender-machines":
        r = rows["d1"]
        assert one(r, "nt_host") == ["laptop-01"] and one(r, "dns") == ["laptop-01.corp.example.com"]
        assert sorted(one(r, "mac")) == ["AABBCCDDEE01", "AABBCCDDEE02"] and "10.1.1.5" in one(r, "ip")
        assert one(r, "os") == ["Windows11 23H2"]
    elif name == "assetdb-src-tenable-assets":
        assert one(rows["t1"], "nt_host") == ["web01"] and one(rows["t1"], "ip") == ["10.2.2.2"] and one(rows["t1"], "os") == ["Ubuntu 22.04"]
        assert one(rows["t2"], "ip") == ["10.2.2.3"] and one(rows["t2"], "nt_host") == ["db01"], "the nested layout is read too"
    else:
        r = rows["c1"]
        assert one(r, "nt_host") == ["WIN10-001"] and one(r, "dns") == ["WIN10-001.corp.example.com"] and one(r, "ip") == ["10.3.3.3"], r
        assert "203.0.113.9" not in json.dumps(r), "the external (NAT) address is not used as a key"
        assert one(rows["c2"], "nt_host") == ["mac-02"], "host_name is accepted as well as hostname"
