import { asList, bestLabel, idLine, sortKeys, ageDays, wildcardRegex } from './util.mjs';

/** Columns the explorer reads itself. Every other column is a user field and is listed under its own name. */
export const RESERVED = new Set(['adb_id', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts', 'adb_icon', 'adb_total']);

/**
 * The explorer's data contract. Guaranteed by the merge: asset (the key values), last_seen, source, conflicts.
 * From the dashboard search: adb_id (the _key), adb_icon (from the adb_icon macro, optional), adb_total (all matches).
 */
export function parseAssets(data, nowMs) {
	if (!data || !data.fields || !data.columns || !data.columns.length) return { assets: [], total: 0, fieldNames: [] };
	const names = data.fields.map((f) => (f && f.name) || String(f));
	const col = {}; names.forEach((n, i) => { col[n] = i; });
	const at = (n, r) => (col[n] === undefined ? undefined : data.columns[col[n]][r]);
	const fieldNames = names.filter((n) => !RESERVED.has(n) && !n.startsWith('_'));
	const assets = [];
	const count = data.columns[0] ? data.columns[0].length : 0;
	for (let r = 0; r < count; r++) {
		const keys = sortKeys(asList(at('asset', r)));
		const icon = asList(at('adb_icon', r))[0] || '';
		const fields = {}; fieldNames.forEach((n) => { fields[n] = asList(at(n, r)); });
		const seen = asList(at('last_seen', r))[0];
		assets.push({
			id: asList(at('adb_id', r))[0] || String(r), keys, label: bestLabel(keys) || '(no keys)', ids: idLine(keys),
			days: ageDays(seen, nowMs), seen: Number(seen) || 0, sources: asList(at('source', r)), conflicts: new Set(asList(at('conflicts', r))),
			icon, fields,
		});
	}
	const t = Number(asList(at('adb_total', 0))[0]);
	return { assets, total: isNaN(t) || !t ? assets.length : t, fieldNames };
}

/** Narrow the loaded assets to those with a key matching the query (the same rule the search uses). */
export function filterAssets(assets, query) {
	const re = wildcardRegex(query);
	return re ? assets.filter((a) => a.keys.some((k) => re.test(k))) : assets.slice();
}

const SORTS = {
	seen: (a, b) => b.seen - a.seen || a.label.localeCompare(b.label),
	name: (a, b) => a.label.localeCompare(b.label),
	sources: (a, b) => b.sources.length - a.sources.length || a.label.localeCompare(b.label),
	conflicts: (a, b) => b.conflicts.size - a.conflicts.size || a.label.localeCompare(b.label),
};
export function sortAssets(assets, mode) { return assets.slice().sort(SORTS[mode] || SORTS.seen); }
