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


def test_there_are_templates():
    assert set(templates()) == {"assetdb-src-splunk-hosts", "assetdb-src-dhcp-cim", "assetdb-src-vulnerabilities-cim", "assetdb-src-ad-computers"}


def test_every_template_is_disabled_unscheduled_and_documented():
    for name, s in templates().items():
        assert s["disabled"] == "1" and s["enableSched"] == "0", name
        assert "Template (version 1" in s["description"], name
        assert len(s["description"]) > 120, name


def test_every_template_writes_a_csv_through_the_output_macro_with_a_matching_name():
    for name, s in templates().items():
        m = re.search(r"`output_adb_lookup\((assetdb_src_[a-z_]+\.csv)\)`\s*$", s["search"])
        assert m, name
        assert m.group(1) in s["description"], "%s: the description must name the lookup file it creates" % name


def test_templates_use_the_field_names_of_the_cim_presets():
    allowed = {"ip", "mac", "nt_host", "dns", "owner", "os", "priority", "bunit", "category", "city", "country", "pci_domain", "is_expected",
               "vuln_signatures", "max_cvss", "_time", "last_seen"}
    for name, s in templates().items():
        tables = re.findall(r"\| table ([^|]+)\|", s["search"])
        for t in tables:
            assert set(t.split()) <= allowed, (name, t)
