"""Unit tests for bin/adbmerge_core.merge_assets (the pure merge logic of `adbmerge`).

Tests marked "pins current behavior" document quirks of the original implementation
that were deliberately preserved by the extraction; change them only with a
conscious behavior change.
"""
import ast
import os
import time
import tracemalloc

import pytest

from adbmerge_core import merge_assets

MAX = 25
CORE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "bin", "adbmerge_core.py")


def ev(name, keys):
    return {"name": name, "_key": keys}


def run(events, max_keys=MAX):
    merged, null_keys, large_keys, total = merge_assets(events, max_keys)
    return merged, null_keys, large_keys, total


def clusters(merged):
    """Map event name -> sorted asset list."""
    return {e["name"]: sorted(e["asset"]) for e in merged}


def test_empty_input():
    assert run([]) == ([], 0, 0, 0)


def test_no_shared_keys_stay_separate():
    merged, nulls, large, total = run([ev("A", ["a1", "a2"]), ev("B", ["b1"])])
    assert clusters(merged) == {"A": ["a1", "a2"], "B": ["b1"]}
    assert (nulls, large, total) == (0, 0, 2)


def test_direct_shared_key_merges():
    merged, *_ = run([ev("A", ["a", "x"]), ev("B", ["x", "b"])])
    assert clusters(merged) == {"A": ["a", "b", "x"], "B": ["a", "b", "x"]}


def test_transitive_chain():
    # A-B share b, B-C share c: A, B, C collapse into one cluster.
    merged, *_ = run([ev("A", ["a", "b"]), ev("B", ["b", "c"]), ev("C", ["c", "d"])])
    expected = ["a", "b", "c", "d"]
    assert clusters(merged) == {"A": expected, "B": expected, "C": expected}


def test_transitive_merge_regardless_of_arrival_order():
    # The bridging asset (B) arrives last.
    merged, *_ = run([ev("A", ["a", "b"]), ev("C", ["c", "d"]), ev("B", ["b", "c"])])
    expected = ["a", "b", "c", "d"]
    assert clusters(merged) == {"A": expected, "B": expected, "C": expected}


def test_multiple_independent_clusters():
    events = [
        ev("A1", ["a", "x"]), ev("A2", ["x", "y"]),
        ev("B1", ["b", "p"]), ev("B2", ["p"]),
        ev("C1", ["lonely"]),
    ]
    got = clusters(run(events)[0])
    assert got["A1"] == got["A2"] == ["a", "x", "y"]
    assert got["B1"] == got["B2"] == ["b", "p"]
    assert got["C1"] == ["lonely"]


def test_scalar_key_is_accepted():
    merged, *_ = run([ev("A", "solo")])
    assert clusters(merged) == {"A": ["solo"]}


def test_assets_without_keys_are_dropped_and_counted():
    events = [ev("A", ["a"]), ev("N1", []), ev("N2", ""), ev("N3", [""])]
    merged, nulls, large, total = run(events)
    assert clusters(merged) == {"A": ["a"]}
    assert (nulls, large, total) == (3, 0, 4)


def test_duplicate_keys_within_one_asset():
    merged, *_ = run([ev("A", ["a", "a", "b"])])
    assert clusters(merged) == {"A": ["a", "b"]}


def test_duplicate_assets_collapse_to_same_cluster():
    merged, *_ = run([ev("A", ["a"]), ev("A2", ["a"])])
    assert clusters(merged) == {"A": ["a"], "A2": ["a"]}


def test_max_keys_boundary_exactly_at_limit_is_not_flagged():
    merged, _, large, _ = run([ev("A", ["a", "b"])], max_keys=2)
    assert clusters(merged) == {"A": ["a", "b"]}
    assert large == 0


def test_max_keys_overflow_flagged():
    merged, _, large, _ = run([ev("A", ["a", "b", "c"])], max_keys=2)
    assert clusters(merged) == {"A": ["MAX_KEYS_REACHED"]}
    assert large == 1


def test_max_keys_overflow_via_merge_poisons_the_whole_cluster():
    events = [ev("A", ["a", "x"]), ev("B", ["x", "b"]), ev("C", ["b", "c"])]
    merged, _, large, total = run(events, max_keys=3)
    assert clusters(merged) == {n: ["MAX_KEYS_REACHED"] for n in "ABC"}
    assert (large, total) == (3, 3)


def test_max_keys_flag_sticks_to_later_assets_sharing_a_key():
    events = [ev("A", ["a", "b", "c"]), ev("B", ["c", "z"])]
    merged, _, large, _ = run(events, max_keys=2)
    assert clusters(merged) == {"A": ["MAX_KEYS_REACHED"], "B": ["MAX_KEYS_REACHED"]}
    assert large == 2


def test_unrelated_cluster_unaffected_by_overflow():
    events = [ev("A", ["a", "b", "c"]), ev("B", ["q"])]
    merged, *_ = run(events, max_keys=2)
    assert clusters(merged) == {"A": ["MAX_KEYS_REACHED"], "B": ["q"]}


# --- empty / whitespace / None keys: pins current behavior -------------------------

def test_single_empty_string_removed_from_list_keys():
    merged, *_ = run([ev("A", ["", "a"])])
    assert clusters(merged) == {"A": ["a"]}


def test_only_first_empty_string_is_removed_pins_current_behavior():
    # list.remove('') drops one occurrence, so a second '' survives as a real key and
    # would link every such asset together.
    merged, nulls, *_ = run([ev("A", ["", "", "a"]), ev("B", ["", "", "b"])])
    assert nulls == 0
    assert clusters(merged) == {"A": ["", "a", "b"], "B": ["", "a", "b"]}


def test_whitespace_key_is_a_real_key_pins_current_behavior():
    merged, *_ = run([ev("A", [" ", "a"]), ev("B", [" ", "b"])])
    assert clusters(merged)["A"] == [" ", "a", "b"]


def test_none_scalar_key_is_a_real_key_pins_current_behavior():
    merged, nulls, *_ = run([ev("A", None), ev("B", None)])
    assert nulls == 0
    assert [e["asset"] for e in merged] == [[None], [None]]


def test_input_key_list_is_mutated_pins_current_behavior():
    keys = ["", "a"]
    run([ev("A", keys)])
    assert keys == ["a"]


# --- determinism ------------------------------------------------------------------

def test_output_grouped_by_first_key_in_arrival_order():
    events = [ev("A1", ["a"]), ev("B1", ["b"]), ev("A2", ["a"]), ev("B2", ["b"])]
    merged, *_ = run(events)
    assert [e["name"] for e in merged] == ["A1", "A2", "B1", "B2"]


def test_asset_contents_are_deterministic_once_sorted():
    events = [ev("A", ["k%d" % i for i in range(10)]), ev("B", ["k9", "extra"])]
    runs = [clusters(run([dict(e, _key=list(e["_key"])) for e in events])[0]) for _ in range(3)]
    assert runs[0] == runs[1] == runs[2]


# --- scale ------------------------------------------------------------------------

@pytest.mark.slow
def test_large_synthetic_dataset_time_and_memory():
    n = 50000
    # Chains of 5 assets (a_i shares a key with a_{i+1}) -> n/5 clusters.
    events = []
    for i in range(n):
        c, pos = divmod(i, 5)
        keys = ["c%d_k%d" % (c, pos)]
        if pos:
            keys.append("c%d_k%d" % (c, pos - 1))
        events.append(ev("e%d" % i, keys))

    tracemalloc.start()
    t0 = time.time()
    merged, nulls, large, total = merge_assets(events, MAX)
    elapsed = time.time() - t0
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert total == n and nulls == 0 and large == 0 and len(merged) == n
    by_cluster = {}
    for e in merged:
        by_cluster.setdefault(e["name"], sorted(e["asset"]))
    assert all(len(a) == 5 for a in by_cluster.values())
    assert elapsed < 10, "merge of %d assets took %.1fs" % (n, elapsed)
    assert peak < 400 * 1024 * 1024, "peak memory %.0f MB" % (peak / 1024.0 / 1024.0)


# --- Python 2/3 compatibility (commands.conf pins python3; the shebang says 2.7) --------

def test_core_module_avoids_python3_only_syntax():
    with open(CORE_PATH) as f:
        tree = ast.parse(f.read())
    banned = (ast.JoinedStr, ast.AnnAssign, ast.Nonlocal, ast.Starred, ast.Await, ast.AsyncFunctionDef)
    for node in ast.walk(tree):
        assert not isinstance(node, banned), "py3-only syntax: %s" % type(node).__name__
        if isinstance(node, ast.FunctionDef):
            assert node.returns is None
            assert all(a.annotation is None for a in node.args.args)
