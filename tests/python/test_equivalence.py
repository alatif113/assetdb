"""merge_assets (union-find) must match the previous set-merging implementation, kept as an oracle
in reference_merge.py (with the same key cleanup and overflow-dropping semantics)."""
import copy
import random

import reference_merge
from adbmerge_core import merge_assets


def _random_events(seed):
    r = random.Random(seed)
    events = []
    for i in range(r.randint(0, 60)):
        n = r.choice([0, 1, 1, 2, 3, 4])
        keys = [r.choice(["", " ", "k%d" % r.randint(0, 25)]) for _ in range(n)]
        events.append({"n": i, "_key": keys if r.random() < 0.8 else (keys[0] if keys else "")})
    return events, r.choice([1, 2, 3, 5, 25])


def _drop_overflow(merged):
    return [e for e in merged if e["asset"] != ["MAX_KEYS_REACHED"]]


def test_matches_reference_implementation():
    for seed in range(500):
        events, max_keys = _random_events(seed)
        new, nulls, large, total = merge_assets(copy.deepcopy(events), max_keys)
        old, old_nulls, old_large, old_total = reference_merge.merge_assets(copy.deepcopy(events), max_keys)
        assert [(e["n"], e["asset"]) for e in new] == [(e["n"], e["asset"]) for e in _drop_overflow(old)], seed
        assert (nulls, large, total) == (old_nulls, old_large, old_total), seed
