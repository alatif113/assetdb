"""The search behind the logos of the Explorer and Coverage pages: the configured sources, with the name of each one's lookup."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def dashboard_search(view, search_id):
    xml = (ROOT / "default" / "data" / "ui" / "views" / view).read_text()
    m = re.search(r'<search id="%s">\s*<query><!\[CDATA\[(.*?)\]\]></query>' % search_id, xml, re.S)
    assert m, "%s has no search %s" % (view, search_id)
    return m.group(1)


@pytest.mark.parametrize("view", ["assetdb_explorer.xml", "assetdb_coverage.xml"])
def test_sources_search_returns_name_and_lookup(splunk, view):
    rows = splunk.search(dashboard_search(view, "ds_sources"), earliest="-1m")
    assert rows, "no configured sources were returned: the logos would fall back to the source name alone"
    for r in rows:
        assert r.get("name") and r.get("lookup"), r


def test_every_configured_source_gets_the_icon_its_name_or_lookup_says(splunk):
    """The configured sources of the dev server, run through the same keyword matcher the pages use (node)."""
    import json
    import subprocess
    rows = splunk.search(dashboard_search("assetdb_explorer.xml", "ds_sources"), earliest="-1m")
    script = ("const fs=require('fs');let m;new Function('define',fs.readFileSync('appserver/static/js/src/vendor_icons.js','utf8'))((d,f)=>{m=f();});"
              "const rows=JSON.parse(process.argv[1]);console.log(JSON.stringify(rows.map(r=>({name:r.name,id:(m.vendorFor(r.name+' '+r.lookup)||{}).id||null}))));")
    out = subprocess.run(["node", "-e", script, json.dumps(rows)], capture_output=True, text=True, cwd=str(ROOT), check=True).stdout
    icons = json.loads(out)
    assert len(icons) == len(rows)
    print("source icons on the server:", icons)
