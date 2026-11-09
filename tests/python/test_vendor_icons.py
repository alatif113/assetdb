"""The vendor logos (assets/vendors.json + assets/vendors/) that the Configure page, the Explorer and the Coverage page show next to a source."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "vendors"
VENDORS = json.loads((ROOT / "assets" / "vendors.json").read_text())


def test_ids_are_unique_and_keywords_present():
    ids = [v["id"] for v in VENDORS]
    assert len(ids) == len(set(ids)) == 31
    for v in VENDORS:
        assert re.fullmatch(r"[a-z0-9]+", v["id"]) and v["name"] and v["keywords"], v["id"]


def test_every_logo_file_exists_and_every_file_is_used():
    used = set()
    for v in VENDORS:
        assert (ASSETS / v["light"]).is_file(), v["light"]
        used.add(v["light"])
        dark = (ASSETS / v["light"]).with_name(Path(v["light"]).stem + ".dark" + Path(v["light"]).suffix)
        if dark.exists():
            used.add(dark.name)
    stray = sorted(p.name for p in ASSETS.iterdir() if p.is_file() and p.name not in used)
    assert not stray, f"logo files no vendor uses: {stray}"


def test_logos_are_small_and_safe():
    total = 0
    for p in ASSETS.iterdir():
        size = p.stat().st_size
        total += size
        assert size < 24_000, f"{p.name} is {size} bytes: simplify or shrink it"
        if p.suffix == ".svg":
            text = p.read_text(encoding="utf-8", errors="replace")
            assert "<svg" in text and not re.search(r"<script|on\w+\s*=|javascript:|<foreignObject|xlink:href=\"http", text, re.I), p.name
        else:
            assert p.suffix == ".png" and p.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", p.name
    assert total < 260_000, f"logos total {total} bytes"


def test_generated_modules_are_current():
    r = subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "build-vendor-icons.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
