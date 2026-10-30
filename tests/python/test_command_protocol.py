"""Run bin/adbmerge.py as Splunk does (chunked protocol v2 over stdin/stdout) with the vendored splunklib."""
import json
import os
import subprocess
import sys

BIN = os.path.join(os.path.dirname(__file__), "..", "..", "bin", "adbmerge.py")


def chunk(meta, body=""):
    m, b = json.dumps(meta).encode(), body.encode()
    return b"chunked 1.0,%d,%d\n" % (len(m), len(b)) + m + b


def read_chunks(data):
    out = []
    while data:
        header, _, rest = data.partition(b"\n")
        _, lens = header.split(b" ", 1)
        ml, bl = [int(x) for x in lens.split(b",")[1:]]
        out.append((json.loads(rest[:ml]), rest[ml:ml + bl].decode()))
        data = rest[ml + bl:]
    return out


def run(csv_body, max_keys=25):
    info = {"args": ["max_keys=%d" % max_keys], "dispatch_dir": "/tmp", "sid": "1", "app": "assetdb",
            "owner": "admin", "username": "admin", "session_key": "k", "splunkd_uri": "https://127.0.0.1:8089",
            "earliest_time": "0", "latest_time": "0", "search": "search%20%2A%20%7C%20adbmerge", "splunk_version": "10.0.0", "command": "adbmerge", "raw_args": ["max_keys=%d" % max_keys]}
    stdin = chunk({"action": "getinfo", "preview": False, "searchinfo": info}) + \
        chunk({"action": "execute", "finished": True}, csv_body)
    p = subprocess.run([sys.executable, BIN], input=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    assert p.returncode == 0, p.stderr.decode()
    return read_chunks(p.stdout)


def test_command_merges_over_the_chunked_protocol():
    chunks = run("_key,name\na,one\nb,two\n\"a\nb\",three\n,none\n")
    body = "".join(b for _, b in chunks)
    assert "one" in body and "two" in body and "three" in body
    assert "none" not in body
    assert "asset" in body
