"""Static checks on metadata/default.meta."""
import os
import re

META = os.path.join(os.path.dirname(__file__), "..", "..", "metadata", "default.meta")


def stanzas():
    out, cur = {}, None
    for line in open(META):
        line = line.strip()
        m = re.match(r"^\[(.*)\]$", line)
        if m:
            cur = out.setdefault(m.group(1), {})
        elif cur is not None and "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            cur[k.strip()] = v.strip()
    return out


def test_configuration_and_data_model_are_admin_writable_only():
    s = stanzas()
    for name in ("assetdb", "savedsearches/assetdb-lookupgen", "collections/assetdb", "transforms/assetdb"):
        assert name in s, name
        assert re.search(r"write\s*:\s*\[\s*admin\s*\]", s[name]["access"]), (name, s[name]["access"])


def test_assetdb_conf_is_replicated_in_search_head_clusters():
    server_conf = os.path.join(os.path.dirname(__file__), "..", "..", "default", "server.conf")
    text = open(server_conf).read()
    assert "[shclustering]" in text and re.search(r"^conf_replication_include\.assetdb\s*=\s*true\s*$", text, re.M)
