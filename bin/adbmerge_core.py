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


def merge_assets(events, max_keys):
    """Merge assets that share any key, directly or transitively.

    :param events: iterable of dict-like events with a `_key` field (str or list of str)
    :param max_keys: clusters with more unique keys than this are dropped
    :return: (merged_events, null_keys, large_keys, total); large_keys counts the dropped assets
    """
    max_keys = min(max_keys, HARD_MAX_KEYS)
    parent = {}  # key -> parent key (union-find forest)
    size = {}  # root -> number of unique keys in its cluster
    entries = []  # (first_key, event) in arrival order
    null_keys = 0
    large_keys = 0
    total = 0

    for event in events:
        total += 1
        raw_keys = event['_key'] if isinstance(event['_key'], list) else [event['_key']]
        key_list = []

        for raw in raw_keys:
            if raw is None:
                continue
            key = raw.strip()
            if key and key not in key_list:
                key_list.append(key)

        if len(key_list) == 0:
            null_keys += 1
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

    merged = []
    for first_key, group in groups.items():
        root = _find(parent, first_key)
        if root not in members:
            large_keys += len(group)
            continue
        keys = sorted(members[root])
        for event in group:
            event['asset'] = list(keys)
            merged.append(event)

    return merged, null_keys, large_keys, total
