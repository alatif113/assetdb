"""Unit tests for bin/adbmerge_core.merge_assets (the pure merge logic of `adbmerge`).

Tests marked "pins current behavior" document quirks that are deliberately kept;
change them only with a conscious behavior change.
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


def test_max_keys_overflow_is_dropped_and_counted():
    merged, _, large, total = run([ev("A", ["a", "b", "c"])], max_keys=2)
    assert merged == []
    assert (large, total) == (1, 1)


def test_max_keys_overflow_via_merge_drops_the_whole_cluster():
    events = [ev("A", ["a", "x"]), ev("B", ["x", "b"]), ev("C", ["b", "c"])]
    merged, _, large, total = run(events, max_keys=3)
    assert merged == []
    assert (large, total) == (3, 3)


def test_max_keys_overflow_sticks_to_later_assets_sharing_a_key():
    events = [ev("A", ["a", "b", "c"]), ev("B", ["c", "z"])]
    merged, _, large, _ = run(events, max_keys=2)
    assert merged == []
    assert large == 2


def test_unrelated_cluster_unaffected_by_overflow():
    events = [ev("A", ["a", "b", "c"]), ev("B", ["q"])]
    merged, _, large, _ = run(events, max_keys=2)
    assert clusters(merged) == {"B": ["q"]}
    assert large == 1


def test_overflow_clusters_do_not_leak_into_each_other_or_survivors():
    events = [ev("A", ["a1", "a2", "a3"]), ev("B", ["b1", "b2", "b3"]), ev("C", ["c1"])]
    merged, _, large, _ = run(events, max_keys=2)
    assert clusters(merged) == {"C": ["c1"]}
    assert large == 2


def test_a_real_key_named_like_the_old_marker_is_just_a_key():
    merged, _, large, _ = run([ev("A", ["MAX_KEYS_REACHED"]), ev("B", ["MAX_KEYS_REACHED", "b"])])
    assert clusters(merged) == {"A": ["MAX_KEYS_REACHED", "b"], "B": ["MAX_KEYS_REACHED", "b"]}
    assert large == 0


# --- empty / whitespace / None keys: pins current behavior -------------------------

def test_single_empty_string_removed_from_list_keys():
    merged, *_ = run([ev("A", ["", "a"])])
    assert clusters(merged) == {"A": ["a"]}


def test_all_empty_strings_are_ignored():
    merged, nulls, *_ = run([ev("A", ["", "", "a"]), ev("B", ["", "", "b"])])
    assert nulls == 0
    assert clusters(merged) == {"A": ["a"], "B": ["b"]}


def test_whitespace_keys_are_ignored_and_keys_are_stripped():
    merged, nulls, *_ = run([ev("A", [" ", " a "]), ev("B", ["a", "  "]), ev("C", ["   "])])
    assert nulls == 1
    assert clusters(merged) == {"A": ["a"], "B": ["a"]}


def test_none_keys_are_dropped():
    merged, nulls, *_ = run([ev("A", None), ev("B", [None, "b"])])
    assert nulls == 1
    assert clusters(merged) == {"B": ["b"]}


def test_input_key_list_is_not_mutated():
    keys = ["", "a"]
    run([ev("A", keys)])
    assert keys == ["", "a"]


# --- determinism ------------------------------------------------------------------

def test_output_grouped_by_first_key_in_arrival_order():
    events = [ev("A1", ["a"]), ev("B1", ["b"]), ev("A2", ["a"]), ev("B2", ["b"])]
    merged, *_ = run(events)
    assert [e["name"] for e in merged] == ["A1", "A2", "B1", "B2"]


def test_asset_lists_are_sorted():
    merged, *_ = run([ev("A", ["c", "a", "b"])])
    assert merged[0]["asset"] == ["a", "b", "c"]


def test_asset_order_is_stable_across_hash_seeds():
    import subprocess
    import sys
    code = (
        "import sys; sys.path.insert(0, %r)\n"
        "from adbmerge_core import merge_assets\n"
        "evs = [{'_key': ['k%%d' %% i for i in range(8)]}, {'_key': ['k7', 'zz', 'aa']}]\n"
        "print(merge_assets(evs, 25)[0][0]['asset'])\n"
    ) % os.path.dirname(CORE_PATH)
    outs = set()
    for seed in ("1", "2", "3", "4", "5"):
        env = dict(os.environ, PYTHONHASHSEED=seed)
        outs.add(subprocess.check_output([sys.executable, "-c", code], env=env))
    assert len(outs) == 1


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


def test_max_keys_is_capped_at_the_hard_limit():
    from adbmerge_core import HARD_MAX_KEYS
    assert HARD_MAX_KEYS == 100
    big = ev("A", ["k%d" % i for i in range(HARD_MAX_KEYS + 1)])
    ok = ev("B", ["j%d" % i for i in range(HARD_MAX_KEYS)])
    merged, _, large, _ = run([big, ok], max_keys=10_000)
    assert [e["name"] for e in merged] == ["B"]
    assert large == 1


# --- enrich-only sources -------------------------------------------------------------------

def enr(name, keys, auth="0"):
    return {"name": name, "_key": keys, "adb_auth": auth}


def test_enrich_row_attaches_to_exactly_one_asset_and_gets_its_asset_list():
    from adbmerge_core import merge
    result = merge([ev("A", ["a", "b"]), enr("E", ["b", "zzz"])], MAX)
    assert clusters(result.merged) == {"A": ["a", "b"], "E": ["a", "b"]}


def test_enrich_row_never_links_two_assets():
    from adbmerge_core import merge
    result = merge([ev("A", ["a"]), ev("B", ["b"]), enr("E", ["a", "b"])], MAX)
    assert clusters(result.merged) == {"A": ["a"], "B": ["b"]}
    assert result.stats["enrich_ambiguous"] == 1


def test_enrich_row_without_a_matching_asset_is_dropped_and_never_creates_one():
    from adbmerge_core import merge
    result = merge([ev("A", ["a"]), enr("E", ["unknown"])], MAX)
    assert clusters(result.merged) == {"A": ["a"]}
    assert result.stats["enrich_unmatched"] == 1


def test_enrich_rows_do_not_count_toward_the_cluster_size_or_bridge_keys():
    from adbmerge_core import merge
    # three enrich rows each carrying a different new key do not grow the asset past max_keys=2
    events = [ev("A", ["a", "b"])] + [enr("E%d" % i, ["a", "extra%d" % i]) for i in range(3)]
    result = merge(events, 2)
    assert sorted(e["name"] for e in result.merged) == ["A", "E0", "E1", "E2"]
    assert all(e["asset"] == ["a", "b"] for e in result.merged)


def test_enrich_row_attached_to_an_overflow_cluster_is_dropped_with_it():
    from adbmerge_core import merge
    result = merge([ev("A", ["a", "b", "c"]), enr("E", ["a"])], 2)
    assert result.merged == [] and result.stats["large_keys"] == 2


def test_auth_value_variants_and_default():
    from adbmerge_core import merge
    # missing adb_auth and adb_auth=1 are authoritative; a multivalue with an authoritative member is too
    result = merge([ev("A", ["a"]), enr("B", ["b"], auth="1"), enr("C", ["c"], auth=["0", "1"])], MAX)
    assert sorted(e["name"] for e in result.merged) == ["A", "B", "C"]


# --- shared (junk) keys -------------------------------------------------------------------

def test_a_key_shared_by_too_many_rows_is_not_used_to_match():
    from adbmerge_core import merge
    nat = "10.0.0.1"
    events = [ev("h%d" % i, ["mac%d" % i, nat]) for i in range(6)] + [ev("lonely", [nat])]
    plain = merge([dict(e, _key=list(e["_key"])) for e in events], MAX)
    assert len({tuple(e["asset"]) for e in plain.merged}) == 1          # everything chained through the NAT address
    guarded = merge(events, MAX, max_key_share=5)
    assert guarded.stats["junk_keys"] == 1 and guarded.junk == [(nat, 7)]
    assert guarded.stats["junk_rows"] == 1                               # "lonely" had only the junk key
    assert clusters(guarded.merged) == {"h%d" % i: ["mac%d" % i] for i in range(6)}


def test_max_key_share_zero_or_not_exceeded_changes_nothing():
    from adbmerge_core import merge
    events = [ev("a", ["k", "x"]), ev("b", ["k", "y"])]
    for share in (0, 2, 10):
        result = merge([dict(e, _key=list(e["_key"])) for e in events], MAX, max_key_share=share)
        assert clusters(result.merged) == {"a": ["k", "x", "y"], "b": ["k", "x", "y"]}
        assert result.stats["junk_keys"] == 0 and result.junk == []


def test_shared_key_counting_includes_enrich_rows_and_most_shared_keys_are_listed_first():
    from adbmerge_core import merge
    events = [ev("a%d" % i, ["u%d" % i, "big", "mid"]) for i in range(4)] + [enr("e%d" % i, ["big"]) for i in range(3)]
    result = merge(events, MAX, max_key_share=3)
    assert result.junk == [("big", 7), ("mid", 4)]
