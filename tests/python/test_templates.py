"""Static checks on the disabled source-lookup templates in default/savedsearches.conf."""
import os
import re

CONF = os.path.join(os.path.dirname(__file__), "..", "..", "default", "savedsearches.conf")


def stanzas():
    out, cur = {}, None
    for line in open(CONF):
        line = line.rstrip("\n")
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            cur = out.setdefault(m.group(1), {})
        elif cur is not None and "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            cur[k.strip()] = v.strip()
    return out


def templates():
    return dict((k, v) for k, v in stanzas().items() if k.startswith("assetdb-src-"))


BUILT_IN = {"assetdb-src-splunk-hosts", "assetdb-src-dhcp-cim", "assetdb-src-vulnerabilities-cim", "assetdb-src-ad-computers", "assetdb-src-defender-machines"}
# one template per vendor product whose Splunk add-on indexes asset or device records (see the table in the README)
VENDORS = {"crowdstrike-devices", "tenable-assets", "servicenow-cmdb", "qualys-vmdr-hosts", "rapid7-insightvm", "armis-devices", "axonius-devices",
           "lansweeper-assets", "jamf-computers", "aws-ec2-instances", "sentinelone-agents", "tanium-inventory", "tanium-discover",
           "carbon-black-cloud-devices", "azure-virtual-machines", "entra-devices", "gcp-compute-instances", "cortex-xdr-endpoints",
           "forescout-hosts", "meraki-devices", "wiz-virtual-machines",
           "runzero-assets", "nozomi-assets", "claroty-xdome-devices", "bigfix-clients", "manageengine-endpoint-central", "trellix-epo-systems",
           "device42-devices", "workspace-one-devices", "cisco-secure-endpoint-computers", "symantec-endpoint-protection"}


def test_there_are_templates():
    assert set(templates()) == BUILT_IN | {"assetdb-src-" + v for v in VENDORS}


def test_every_template_is_disabled_unscheduled_and_documented():
    for name, s in templates().items():
        assert s["disabled"] == "1" and s["enableSched"] == "0", name
        assert re.match(r"Template \(version \d+", s["description"]), name
        assert len(s["description"]) > 120, name


def test_every_template_writes_a_csv_through_the_output_macro_with_a_matching_name():
    for name, s in templates().items():
        m = re.search(r"`output_adb_lookup\((assetdb_src_[a-z0-9_]+\.csv)\)`\s*$", s["search"])
        assert m, name
        assert m.group(1) in s["description"], "%s: the description must name the lookup file it creates" % name


def test_templates_use_the_field_names_of_the_cim_presets():
    allowed = {"ip", "mac", "nt_host", "dns", "owner", "os", "priority", "bunit", "category", "city", "country", "pci_domain", "is_expected",
               "vuln_signatures", "max_cvss", "_time", "last_seen", "cs_device_id", "defender_id", "tenable_id",
               # the identifier a vendor gives its own record, kept so that it can be added as a field
               "snow_sys_id", "insightvm_id", "armis_id", "axonius_id", "lansweeper_id", "jamf_id", "aws_instance_id", "s1_agent_id", "tanium_serial",
               "cbc_device_id", "azure_vm_id", "entra_device_id", "gcp_instance", "xdr_endpoint_id", "meraki_serial", "wiz_vm_id",
               "runzero_id", "nozomi_id", "claroty_uid", "bigfix_id", "manageengine_id", "device42_id", "workspace_one_id", "cisco_se_id", "serial"}
    for name, s in templates().items():
        tables = re.findall(r"\| table ([^|]+)\|", s["search"])
        for t in tables:
            assert set(t.split()) <= allowed, (name, t)


def test_vendor_templates_say_which_add_on_they_need_and_what_they_read():
    for v in VENDORS:
        d = templates()["assetdb-src-" + v]["description"]
        assert re.search(r"add-on|\bTA\b|App for Splunk", d, re.I), "%s: name the add-on" % v
        assert re.search(r"sourcetypes? [\w:{}*.-]+", d), "%s: name the sourcetype" % v


def test_vendor_templates_never_use_an_external_or_nat_address_as_a_key():
    # shared public addresses must not link unrelated assets; the templates that could see one say they do not read it
    banned = ["external_ip", "externalIp", "nat_ip", "public_ip", "ip_address_public", "lastIpAddress", "PublicIpAddress", "PublicDnsName"]
    for v in VENDORS:
        spl = templates()["assetdb-src-" + v]["search"]
        for b in banned:
            assert not re.search(r"(?<![\w.])%s(?![\w])" % re.escape(b), spl), (v, b)
