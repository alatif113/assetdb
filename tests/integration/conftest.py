"""Fixtures for tests that run against the live (dev) Splunk server.

Safety: tests never touch the real `assetdb` KV collection or assetdb.conf. They create
uniquely named temporary objects (adbtest_<runid>*) and delete them in teardown.
"""
import os
import subprocess
import time
import uuid
import warnings
import json

import pytest
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP = "assetdb"


def _load_env_local():
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


_load_env_local()


def pytest_collection_modifyitems(items):
    for item in items:
        item.add_marker(pytest.mark.integration)


class Splunk(object):
    def __init__(self):
        host = os.environ.get("SPLUNK_HOST")
        if not host:
            pytest.exit("SPLUNK_HOST is not set (see .env.example / .env.local)", returncode=3)
        allowed = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]
        if host not in allowed:
            pytest.exit("SPLUNK_HOST %r is not in ALLOWED_HOSTS %r" % (host, allowed), returncode=3)
        self.host = host
        self.mgmt = "https://%s:%s" % (host, os.environ.get("SPLUNK_MGMT_PORT", "8089"))
        self.web = "https://%s:%s" % (host, os.environ.get("SPLUNK_WEB_PORT", "8000"))
        self.token = os.environ.get("SPLUNK_TOKEN")
        self.user = os.environ.get("SPLUNK_USER")
        self.password = os.environ.get("SPLUNK_PASSWORD")
        if not self.token and not (self.user and self.password):
            pytest.exit("Set SPLUNK_TOKEN or SPLUNK_USER and SPLUNK_PASSWORD", returncode=3)
        if os.environ.get("SPLUNK_INSECURE_TLS") == "1":
            warnings.warn("SPLUNK_INSECURE_TLS=1: TLS certificate verification is DISABLED", stacklevel=2)
            self.verify = False
            requests.packages.urllib3.disable_warnings()
        else:
            self.verify = os.environ.get("SPLUNK_CA_BUNDLE") or True
        self.s = requests.Session()
        self.s.verify = self.verify
        if self.token:
            self.s.headers["Authorization"] = "Bearer " + self.token
        else:
            self.s.auth = (self.user, self.password)

    def get(self, path, **params):
        params.setdefault("output_mode", "json")
        r = self.s.get(self.mgmt + path, params=params, timeout=60)
        return r

    def post(self, path, data=None):
        data = dict(data or {})
        data.setdefault("output_mode", "json")
        return self.s.post(self.mgmt + path, data=data, timeout=120)

    def delete(self, path):
        return self.s.delete(self.mgmt + path, params={"output_mode": "json"}, timeout=60)

    def search(self, spl, earliest="-24h", latest="now"):
        """Run a blocking search and return result rows (list of dicts)."""
        r = self.s.post(
            self.mgmt + "/servicesNS/nobody/%s/search/v2/jobs/export" % APP,
            data={"search": spl if spl.lstrip().startswith(("|", "search")) else "search " + spl,
                  "output_mode": "json", "earliest_time": earliest, "latest_time": latest},
            timeout=600,
        )
        assert r.status_code == 200, "search failed (%s): %s\n%s" % (r.status_code, r.text[:500], spl[:500])
        rows = []
        for line in r.text.splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            if "result" in obj:
                rows.append(obj["result"])
            for m in obj.get("messages", []) or []:
                assert m.get("type") not in ("FATAL", "ERROR"), "search error: %s" % m
        return rows

    def web_session(self):
        """Log in to Splunk Web with user/password; returns a requests.Session or skips."""
        if not (self.user and self.password):
            pytest.skip("web login needs SPLUNK_USER/SPLUNK_PASSWORD (tokens cannot log in to Splunk Web)")
        s = requests.Session()
        s.verify = self.verify
        s.get(self.web + "/en-US/account/login", timeout=30)
        cval = s.cookies.get("cval")
        r = s.post(self.web + "/en-US/account/login",
                   data={"username": self.user, "password": self.password, "cval": cval, "set_has_logged_in": "false"},
                   timeout=30)
        assert r.status_code in (200, 303), "web login failed: %s" % r.status_code
        return s


@pytest.fixture(scope="session")
def splunk():
    return Splunk()


@pytest.fixture(scope="session")
def run_id():
    return uuid.uuid4().hex[:8]


@pytest.fixture(scope="session")
def run_started():
    return int(time.time())


@pytest.fixture(scope="session")
def package_version():
    out = subprocess.check_output(
        ["bash", "-c", "source scripts/lib.sh; app_version"], cwd=ROOT, universal_newlines=True)
    return out.strip()
