import { vendorFor, vendorIcon } from './vendor-icons.mjs';

// The logo shown next to a source's name: picked from keywords in the source name and in the name of its lookup. The lookups come from an
// optional data source `sources` (columns name and lookup); without it the name alone is used.

/** { sourceName: lookupName } from a `sources` data source ({ fields: [{name}], columns: [[...]] }); {} when there is none. */
export function lookupMap(data) {
	const out = {};
	if (!data || !data.fields || !data.columns) return out;
	const idx = {}; data.fields.forEach((f, i) => { idx[f.name] = i; });
	if (idx.name === undefined || idx.lookup === undefined) return out;
	const first = (v) => (Array.isArray(v) ? v[0] : v);
	const n = data.columns[idx.name] ? data.columns[idx.name].length : 0;
	for (let i = 0; i < n; i++) { const name = first(data.columns[idx.name][i]), lookup = first(data.columns[idx.lookup][i]); if (name) out[String(name)] = String(lookup || ''); }
	return out;
}

/** True when a source has a vendor logo (its name or its lookup name names a product). */
export function hasVendorIcon(name, lookups) {
	return !!vendorFor(String(name || '') + ' ' + ((lookups && lookups[name]) || ''));
}

/** The icon (HTML) for a source: its vendor's logo, or the neutral icon. */
export function sourceIcon(name, lookups, theme, px) {
	return vendorIcon(vendorFor(String(name || '') + ' ' + ((lookups && lookups[name]) || '')), theme, px);
}
