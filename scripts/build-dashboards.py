#!/usr/bin/env python3
"""Builds the two classic (Simple XML) dashboards of the app: default/data/ui/views/assetdb_explorer.xml and assetdb_coverage.xml.

The XML is generated so the searches stay readable here; the output is committed and `make test` fails if it is stale
(scripts/build-dashboards.py --check). The dashboards follow the user's Splunk theme (no theme attribute) and show the
AssetDB visualizations (viz/, built into appserver/static/classic/) in an iframe fed by the page scripts
appserver/static/js/src/adb_explorer.js and adb_coverage.js. In the SPL below a literal dollar sign is written $$.

Nothing here names a user field: the Explorer lists whatever the assets have, and Coverage groups by any field of the assetdb
lookup, which the Configure page keeps in step with the configured fields.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VIEWS = ROOT / "default" / "data" / "ui" / "views"
LIMIT = 100        # assets the Explorer search returns. The visualization says so and the search box narrows it.
MAX_GROUPS = 500
RESERVED = '"_key", "asset", "source", "source_lookup", "last_seen", "scope", "conflicts"'

# --- shared SPL -------------------------------------------------------------------------------------------------------
# Search text -> regular expression: "contains", case-insensitive, * is a wildcard, everything else is literal.
def pattern(tok, var="adb_pat"):
    return ('eval %s=lower(trim(%s)), %s=if(len(%s)=0, ".*", replace(replace(%s, "([.^$$|()\\\\[\\\\]{}+?\\\\\\\\])", "\\\\\\\\\\\\1"), "\\\\*", ".*"))'
            % (var, tok, var, var, var))
MATCH = "where mvcount(mvmap(asset, if(match(lower(asset), adb_pat), 1, null()))) > 0"

# A readable asset label from the key values alone: the shortest name, else the first IP, else the first value.
IPV4 = '^([0-9]{1,3}[.]){3}[0-9]{1,3}$$'
IPV6 = '^[0-9a-fA-F]*:[0-9a-fA-F:.]*$$'
MAC = '^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$$|^[0-9a-fA-F]{12}$$'
LABEL = ('eval adb_n=mvmap(asset, if(match(asset, "%s") OR match(asset, "%s") OR match(asset, "%s"), null(), printf("%%03d", len(asset)) . asset))\n'
         '| eval adb_i=mvmap(asset, if(match(asset, "%s"), null(), if(match(asset, "%s") OR match(asset, "%s"), asset, null())))\n'
         '| eval adb_label=coalesce(substr(mvindex(mvsort(adb_n), 0), 4), mvindex(adb_i, 0), mvindex(asset, 0))') % (IPV4, IPV6, MAC, MAC, IPV4, IPV6)
RANK = ('eval adb_r=case(match(Asset, "%s"), 2, match(Asset, "%s") OR match(Asset, "%s"), 1, true(), 0)\n| sort 0 adb_r Asset\n| fields - adb_r') % (MAC, IPV4, IPV6)

# --- Explorer ---------------------------------------------------------------------------------------------------------
# The search text only filters when something was typed: `if` evaluates just the branch it takes, so with an empty box (the usual case)
# the regex is never run. Two searches run side by side instead of one with an eventstats: the page shows the first 100 assets (sort 100
# keeps only the top 100 instead of sorting everything) and the other counts the matches (stats streams, eventstats keeps every event in
# memory). On 500,000 assets that took 7.5 s with one search; the two together take about 1.7 s, in parallel.
FILTER = """| %(pattern)s
| where if(adb_pat=".*", true(), mvcount(mvmap(asset, if(match(lower(asset), adb_pat), 1, null()))) > 0)""" % {"pattern": pattern("$adb_q|s$")}
ASSETS = """| inputlookup assetdb
%(filter)s
| eval adb_seen=coalesce(tonumber(last_seen), 0)
| sort %(limit)d - adb_seen
| eval adb_id=_key
| `adb_icon`
| fields - adb_pat adb_seen _mkv_child""" % {"filter": FILTER, "limit": LIMIT}
TOTAL = """| inputlookup assetdb
| fields _key asset
%(filter)s
| stats count as adb_total""" % {"filter": FILTER}
# the macro puts the quotes around the key itself (Splunk strips the quotes of a quoted macro argument)
PROVENANCE = "| `adb_provenance($adb_asset$)`"
# The configured sources (name and lookup) so that a source's logo can be picked from its lookup name as well as its name. It reads the app's
# configuration, which not every role may read: if it fails the pages simply use the source name alone.
SOURCES = """| rest splunk_server=local /servicesNS/nobody/assetdb/configs/conf-assetdb/general
| fields lookups
| spath input=lookups path={} output=src
| mvexpand src
| spath input=src
| table name lookup"""

# --- Coverage ---------------------------------------------------------------------------------------------------------
GROUPS = """| rest /servicesNS/nobody/assetdb/data/transforms/lookups splunk_server=local count=0
| where title="assetdb"
| eval f=split(fields_list, ",")
| mvexpand f
| where len(f) > 0 AND NOT in(f, %(reserved)s)
| eval label=f, value=f, ord=1
| append [| makeresults | eval label="No grouping", value="No grouping", ord=0]
| sort 0 ord label
| table label value""" % {"reserved": RESERVED}
# The share of each group's assets that each source contributed to (the `source` of the merged asset). The row size is
# sent as the pseudo-source adb_total, which the heatmap reads as the row's asset count.
# One pass over the assets, keeping only what is counted (_key is not needed: a field name is). Every asset also gets the pseudo-source
# adb_total, so the count of that "source" per group is the number of assets in the group and no eventstats over all the assets is
# needed (500,000 assets: 7-8 s with eventstats and dc, 2-2.4 s now, same result).
COVERAGE = """| inputlookup assetdb
| fields source, "$cov_by$"
| eval adb_g=if("$cov_by$"="No grouping", "All assets", '$cov_by$')
| eval adb_g=mvdedup(mvmap(adb_g, if(len(trim(adb_g)) > 0, adb_g, null())))
| eval adb_g=coalesce(adb_g, "(no value)"), source=mvappend(source, "adb_total")
| mvexpand adb_g
| mvexpand source
| stats count as n by adb_g source
| eventstats max(eval(if(source="adb_total", n, null()))) as adb_total by adb_g
| eval pct=if(source="adb_total", adb_total, round(100 * n / adb_total, 2))
| xyseries adb_g source pct
| fillnull value=0
| rename adb_g as Group
| sort 0 Group
| head %(max)d""" % {"max": MAX_GROUPS}


# Gray bars shown from the first paint until the visualization's iframe has loaded (adb_frame.js removes .adb-ph when it is ready; the
# visualization then shows its own skeleton until its data arrives). Inline, because the page's stylesheet is added by script, later.
PH_STYLE = ('<style>.adb-ph{position:absolute;inset:0;overflow:hidden;pointer-events:none}.adb-ph i{display:block;border-radius:6px;'
            'background:linear-gradient(90deg,rgba(127,127,127,.16) 25%,rgba(127,127,127,.28) 50%,rgba(127,127,127,.16) 75%);background-size:200% 100%;'
            'animation:adbph 1.3s linear infinite}@keyframes adbph{from{background-position:200% 0}to{background-position:-200% 0}}'
            '@media (prefers-reduced-motion:reduce){.adb-ph i{animation:none}}</style>')
PH_EXPLORER = ('<div class="adb-ph" aria-hidden="true"><div style="display:grid;grid-template-columns:340px 1fr;height:100%;gap:0">'
               '<div style="padding:14px"><i style="height:34px"></i>' + ''.join('<i style="height:34px;margin-top:16px;width:%d%%"></i>' % w for w in (90, 78, 84, 70, 88, 74, 80, 66)) + '</div>'
               '<div style="padding:24px"><i style="height:24px;width:260px"></i><i style="height:12px;width:200px;margin-top:12px"></i>'
               + ''.join('<i style="height:14px;margin-top:30px;width:%d%%"></i>' % w for w in (60, 46, 70, 52, 64, 40)) + '</div></div></div>')
PH_COVERAGE = ('<div class="adb-ph" aria-hidden="true"><div style="display:grid;grid-template-columns:140px repeat(8,1fr);gap:6px;padding:24px">'
               + ''.join('<i style="height:30px"></i>' * 9 for _ in range(7)) + '</div></div>')


def search(sid, query, extra=""):
    return ('  <search id="%s">\n    <query><![CDATA[%s]]></query>\n    <earliest>-1m</earliest>\n    <latest>now</latest>%s\n  </search>\n') % (sid, query, extra)


EXPLORER = (
    '<dashboard version="1.1" theme="dark" script="js/adb_explorer.min.js" stylesheet="css/page.css">\n'
    '  <label>Explorer</label>\n'
    '  <description>Find an asset by any of its key values, then see which source supplied each of its fields.</description>\n'
    + search("ds_assets", ASSETS) + search("ds_total", TOTAL) + search("ds_prov", PROVENANCE) + search("ds_sources", SOURCES) +
    '  <row>\n    <panel>\n      <html>\n        ' + PH_STYLE + '\n        <div id="adb_explorer" style="position: relative; height: calc(100vh - 200px); min-height: 640px;">' + PH_EXPLORER + '</div>\n      </html>\n    </panel>\n  </row>\n'
    '</dashboard>\n')

COVERAGE_VIEW = (
    '<form version="1.1" theme="dark" script="js/adb_coverage.min.js" stylesheet="css/page.css">\n'
    '  <label>Coverage</label>\n'
    '  <description>How much of your estate each source covers. Click a cell to open a search of those assets.</description>\n'
    + search("ds_cov", COVERAGE) + search("ds_sources", SOURCES) +
    '  <fieldset submitButton="false">\n'
    '    <input type="dropdown" token="cov_by" searchWhenChanged="true">\n'
    '      <label>Group by</label>\n'
    '      <default>No grouping</default>\n'
    '      <fieldForLabel>label</fieldForLabel>\n'
    '      <fieldForValue>value</fieldForValue>\n'
    '      <search>\n        <query><![CDATA[' + GROUPS + ']]></query>\n        <earliest>-1m</earliest>\n        <latest>now</latest>\n      </search>\n'
    '    </input>\n'
    '  </fieldset>\n'
    '  <row>\n    <panel>\n      <html>\n        ' + PH_STYLE + '\n        <div id="adb_coverage" style="position: relative; height: calc(100vh - 260px); min-height: 460px;">' + PH_COVERAGE + '</div>\n      </html>\n    </panel>\n  </row>\n'
    '</form>\n')

FILES = {"assetdb_explorer.xml": EXPLORER, "assetdb_coverage.xml": COVERAGE_VIEW}
if "--check" in sys.argv:
    stale = [n for n, x in FILES.items() if not (VIEWS / n).exists() or (VIEWS / n).read_text() != x]
    if stale:
        print("out of date: %s; run: python3 scripts/build-dashboards.py" % ", ".join("default/data/ui/views/" + n for n in stale))
        sys.exit(1)
    print("[ ok ] the classic dashboards match their generator")
    sys.exit(0)
VIEWS.mkdir(parents=True, exist_ok=True)
for n, x in FILES.items():
    (VIEWS / n).write_text(x)
    print("wrote", VIEWS / n)
