"""Configure view and built JS are served by Splunk Web."""
import os

from conftest import APP, ROOT


def test_configure_view_loads(splunk):
    s = splunk.web_session()
    r = s.get("%s/en-US/app/%s/configure" % (splunk.web, APP), timeout=60)
    assert r.status_code == 200
    for bad in ("Oops.", "Page not found", "Traceback"):
        assert bad not in r.text, "error text in page: %s" % bad


def test_built_js_is_served_and_matches_package(splunk):
    local = os.path.join(ROOT, "appserver", "static", "js", "assetdb.min.js")
    r = splunk.s.get("%s/en-US/static/app/%s/js/assetdb.min.js" % (splunk.web, APP), timeout=60)
    assert r.status_code == 200
    assert "javascript" in r.headers.get("Content-Type", "")
    assert len(r.content) > 1000
    with open(local, "rb") as f:
        assert r.content == f.read(), "served assetdb.min.js differs from the repo build (stale deploy or browser/proxy cache?)"
