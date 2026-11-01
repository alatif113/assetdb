"""REFERENCE ONLY: the previous set-merging implementation (O(n * set size)), kept as a test oracle.
Pure merge logic for the adbmerge search command.

Extracted from ADBMergeCommand.reduce so it can be unit tested without
splunklib. Keys are stripped, empty/None keys are ignored, and each asset's key
list is sorted so the downstream md5 `_key` is stable across processes.
"""


# Marks a cluster that grew past max_keys. A private object so no real key can collide with it.
_OVERFLOW = 'MAX_KEYS_REACHED'


def merge_assets(events, max_keys):
    """Merge assets that share any key, directly or transitively.

    :param events: iterable of dict-like events with a `_key` field (str or list of str)
    :param max_keys: clusters with more unique keys than this are dropped
    :return: (merged_events, null_keys, large_keys, total); large_keys counts the dropped assets
    """
    key_map = {}
    event_map = {}
    null_keys = 0
    large_keys = 0
    total = 0
    merged = []

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

        key_set = set(key_list)

        for key in key_list:
            if key not in key_map:
                key_map[key] = key_set
            else:
                key_set = key_set.union(key_map.get(key, {}))

        for key in key_set:
            if len(key_set) > max_keys or _OVERFLOW in key_set:
                key_map[key] = {_OVERFLOW}
            else:
                key_map[key] = key_set

        first_key = key_list[0]

        if first_key not in event_map:
            event_map[first_key] = [event]
        else:
            event_map[first_key].append(event)

    for key in event_map:
        for event in event_map[key]:
            key_list = sorted(key_map[key])
            if key_list[0] == 'MAX_KEYS_REACHED':
                large_keys += 1

            event['asset'] = key_list

            merged.append(event)

    return merged, null_keys, large_keys, total
