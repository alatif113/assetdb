"""Pure merge logic for the adbmerge search command.

Extracted from ADBMergeCommand.reduce so it can be unit tested without
splunklib. Keys are stripped, empty/None keys are ignored, and each asset's key
list is sorted so the downstream md5 `_key` is stable across processes.

Assets are merged with a union-find over their keys, so the cost is near linear in
the number of keys no matter how large max_keys is.
"""


# Upper bound for max_keys, enforced here and by the command option (and the UI/generator): every cluster's
# key set is materialised and sorted, so very large clusters make the merge too expensive.
HARD_MAX_KEYS = 100


def _find(parent, key):
    root = key
    while parent[root] != root:
        root = parent[root]
    while parent[key] != root:  # path compression
        parent[key], key = root, parent[key]
    return root


class MergeResult(object):
    """What a merge produced: the merged events and counters for the run summary."""

    def __init__(self):
        self.merged = []
        self.overflow = []  # one event per cluster that was too large to merge (only with emit_overflow)
        self.stats = {'total': 0, 'null_keys': 0, 'large_keys': 0, 'enrich_unmatched': 0, 'enrich_ambiguous': 0, 'junk_keys': 0, 'junk_rows': 0}
        self.junk = []  # (key, rows) of the most widely shared keys that were removed, most shared first

    def annotate(self):
        """Stamp the run counters on every merged event so the search can record the run after the final stats."""
        for event in self.merged:
            event['adb_total'] = self.stats['total']
            event['adb_null_keys'] = self.stats['null_keys']
            event['adb_large_keys'] = self.stats['large_keys']
            event['adb_enrich_unmatched'] = self.stats['enrich_unmatched']
            event['adb_enrich_ambiguous'] = self.stats['enrich_ambiguous']
            event['adb_junk_keys'] = self.stats['junk_keys']
            event['adb_junk_rows'] = self.stats['junk_rows']


def _clean_keys(event):
    raw_keys = event['_key'] if isinstance(event['_key'], list) else [event['_key']]
    key_list = []
    for raw in raw_keys:
        if raw is None:
            continue
        key = raw.strip()
        if key and key not in key_list:
            key_list.append(key)
    return key_list


def _is_enrich(event):
    """Rows from enrich-only sources carry adb_auth=0 (the generator adds the field only when such sources exist)."""
    value = event.get('adb_auth')
    if isinstance(value, list):
        value = max(value) if value else None
    return value is not None and str(value).strip() == '0'


def merge(events, max_keys, max_key_share=0, emit_overflow=False):
    """Merge assets that share any key, directly or transitively.

    Authoritative rows create assets and link assets together. Enrich-only rows (adb_auth=0) never create or link
    assets: a row attaches to an asset only when its keys point at exactly one asset, otherwise it is dropped.

    :param events: iterable of dict-like events with a `_key` field (str or list of str)
    :param max_keys: clusters with more unique keys than this are dropped
    :param max_key_share: a key found in more than this many input rows is not used to match (0 disables). Such keys
        (a NAT address, a golden image host name) would otherwise chain unrelated assets into one cluster. Rows left
        without any key are dropped and counted
    :param emit_overflow: also return one summary event per dropped cluster in MergeResult.overflow
    :return: MergeResult
    """
    result = MergeResult()
    stats = result.stats
    max_keys = min(max_keys, HARD_MAX_KEYS)
    parent = {}  # key -> parent key (union-find forest)
    size = {}  # root -> number of unique keys in its cluster
    entries = []  # (first_key, event) of authoritative rows, in arrival order
    enrich = []  # (key_list, event) of enrich-only rows, in arrival order
    rows = []  # (key_list, event, is_enrich)

    for event in events:
        stats['total'] += 1
        key_list = _clean_keys(event)

        if len(key_list) == 0:
            stats['null_keys'] += 1
            continue
        rows.append((key_list, event, _is_enrich(event)))

    if max_key_share and max_key_share > 0:
        counts = {}
        for key_list, _, _ in rows:
            for key in key_list:
                counts[key] = counts.get(key, 0) + 1
        junk = dict((key, n) for key, n in counts.items() if n > max_key_share)
        if junk:
            stats['junk_keys'] = len(junk)
            result.junk = sorted(junk.items(), key=lambda kv: (-kv[1], kv[0]))[:20]
            kept = []
            for key_list, event, is_enrich in rows:
                key_list = [k for k in key_list if k not in junk]
                if key_list:
                    kept.append((key_list, event, is_enrich))
                else:
                    stats['junk_rows'] += 1
            rows = kept

    for key_list, event, is_enrich in rows:
        if is_enrich:
            enrich.append((key_list, event))
            continue

        first_root = None
        for key in key_list:
            if key not in parent:
                parent[key] = key
                size[key] = 1
            root = _find(parent, key)
            if first_root is None:
                first_root = root
            elif root != first_root:
                if size[root] > size[first_root]:
                    root, first_root = first_root, root
                parent[root] = first_root
                size[first_root] += size.pop(root)

        entries.append((key_list[0], event))

    members = {}  # root -> keys of the cluster, only for clusters within max_keys
    for key in parent:
        root = _find(parent, key)
        if size[root] <= max_keys:
            members.setdefault(root, []).append(key)

    # Events are emitted grouped by their first key, in order of first appearance.
    groups = {}
    for first_key, event in entries:
        groups.setdefault(first_key, []).append(event)

    overflow = {}  # root -> [rows, sources, source_lookups] of clusters that were too large

    def note_overflow(root, events_):
        info = overflow.setdefault(root, [0, set(), set()])
        for event_ in events_:
            info[0] += 1
            for index, field in ((1, 'source'), (2, 'source_lookup')):
                value = event_.get(field)
                for item in (value if isinstance(value, list) else [value]):
                    if item not in (None, ''):
                        info[index].add(item)

    for first_key, group in groups.items():
        root = _find(parent, first_key)
        if root not in members:
            stats['large_keys'] += len(group)
            note_overflow(root, group)
            continue
        keys = sorted(members[root])
        for event in group:
            event['asset'] = list(keys)
            result.merged.append(event)

    for key_list, event in enrich:
        roots = set(_find(parent, key) for key in key_list if key in parent)
        if not roots:
            stats['enrich_unmatched'] += 1
        elif len(roots) > 1:
            stats['enrich_ambiguous'] += 1
        else:
            root = roots.pop()
            if root in members:
                event['asset'] = sorted(members[root])
                result.merged.append(event)
            else:
                stats['large_keys'] += 1
                note_overflow(root, [event])

    if emit_overflow and overflow:
        cluster_keys = {}
        for key in parent:
            root = _find(parent, key)
            if root in overflow:
                cluster_keys.setdefault(root, []).append(key)
        for root, (rows_, sources, lookups) in sorted(overflow.items(), key=lambda kv: -kv[1][0]):
            keys = sorted(cluster_keys.get(root, []))
            result.overflow.append({
                'adb_overflow': 1, 'asset': keys[:20], 'adb_cluster_keys': len(keys), 'adb_cluster_rows': rows_,
                'source': sorted(sources), 'source_lookup': sorted(lookups),
            })

    return result


def with_common_fields(events):
    """Give the first event every field name any event has.

    Splunk's chunked protocol takes the column names from the first record written, so a field that only later
    events have (the overflow summaries) would be silently dropped. Missing values are written empty.
    """
    events = list(events)
    if events:
        first = events[0]
        for event in events:
            for name in event:
                first.setdefault(name, None)
    return events


def merge_assets(events, max_keys, max_key_share=0):
    """Backwards compatible wrapper: (merged_events, null_keys, large_keys, total); large_keys counts dropped assets."""
    result = merge(events, max_keys, max_key_share)
    return result.merged, result.stats['null_keys'], result.stats['large_keys'], result.stats['total']
