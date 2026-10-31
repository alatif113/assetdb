"""More than 50,000 assets: the merge, and the safety check on a real Splunk.

SPL cannot generate more than 50,000 rows per makeresults, so the sources are appended from several parts. These tests take a
few minutes; they are the evidence that nothing in the pipeline is capped at 50,000 assets.
"""
import pytest

from sandbox import Sandbox, field

N = 120000


@pytest.fixture
def box(splunk, run_id):
    b = Sandbox(splunk, run_id, "scale")
    yield b
    b.close()


def test_a_hundred_and_twenty_thousand_assets_merge(box):
    box.general = {"key_blocklist": "[]", "max_key_share": "0"}
    box.fields = [field("mac", key_field="1"), field("owner", field_type="single"), field("ip")]
    box.add_generated_source("big", N, 'mac="m".n, owner="owner".n, ip="10.".floor(n/65536).".".(floor(n/256)%256).".".(n%256)')
    first = box.run()
    assert len(first) == N                                              # nothing is cut off at 50,000
    assert box.runs_rows()[-1]["assets_out"] == str(N)

    # second run: 300 assets disappear, 500 are new, 200 change their owner
    box.rewrite_generated_source("big", N, 'mac=if(n<=300, "gone".n, "m".n), owner=if(n%600=0, "newowner".n, "owner".n), ip="10.".floor(n/65536).".".(floor(n/256)%256).".".(n%256)')
    second = box.run()
    assert len(second) == N


def test_clusters_whose_rows_are_far_apart_in_the_input_are_still_merged(box):
    """Splunk hands a command its rows in chunks of ~20,000. Rows 1..60000 and 60001..120000 describe the same 60,000 assets
    through different keys (a shared mac), so every asset spans two chunks; a per chunk merge leaves 120,000 fragments."""
    box.general = {"min_ratio": "0", "key_blocklist": "[]", "max_key_share": "0"}
    box.fields = [field("mac", key_field="1"), field("ip", key_field="1"), field("nt_host", key_field="1")]
    expr = ('k=if(n<=60000, n, n-60000), mac="m".k, ip=if(n<=60000, "ip".k, null()), nt_host=if(n>60000, "h".k, null())')
    box.add_generated_source("far", 120000, expr)
    rows = box.run()
    assert len(rows) == 60000, len(rows)
    assert all(len(r["asset"]) == 3 for r in rows[:2000])
