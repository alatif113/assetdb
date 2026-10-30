"""Pure merge logic for the adbmerge search command.

Extracted verbatim from ADBMergeCommand.reduce so it can be unit tested without
splunklib. No behavior change: only the logger calls and the generator `yield`
were replaced by a return value.
"""


def merge_assets(events, max_keys):
    """Merge assets that share any key, directly or transitively.

    :param events: iterable of dict-like events with a `_key` field (str or list of str)
    :param max_keys: key sets larger than this are flagged ['MAX_KEYS_REACHED']
    :return: (merged_events, null_keys, large_keys, total)
    """
    key_map = {}
    event_map = {}
    null_keys = 0
    large_keys = 0
    total = 0
    merged = []

    for event in events:
        total += 1
        key_list = event['_key'] if isinstance(event['_key'], list) else [event['_key']]

        if '' in key_list:
            key_list.remove('')

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
            if len(key_set) > max_keys or 'MAX_KEYS_REACHED' in key_set:
                key_map[key] = {'MAX_KEYS_REACHED'}
            else:
                key_map[key] = key_set

        first_key = key_list[0]

        if first_key not in event_map:
            event_map[first_key] = [event]
        else:
            event_map[first_key].append(event)

    for key in event_map:
        for event in event_map[key]:
            key_list = list(key_map[key])

            if key_list[0] == 'MAX_KEYS_REACHED':
                large_keys += 1

            event['asset'] = key_list

            merged.append(event)

    return merged, null_keys, large_keys, total
