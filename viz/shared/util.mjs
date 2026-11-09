// Pure helpers shared by the AssetDB visualizations. Nothing here touches the DOM, so node can test it.

export const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:.]*$/i;
export const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{12}$/i;

/** What a key value looks like. The merged asset only has an unnamed list of keys, so kind is read from the shape. */
export function shape(v) { const s = String(v); return MAC_RE.test(s) ? 'mac' : IP_RE.test(s) ? 'ip' : 'name'; }

const ORDER = { name: 0, ip: 1, mac: 2 };
/** Names first (shortest first), then IPs, then MACs. */
export function sortKeys(keys) {
	return keys.slice().sort((a, b) => ORDER[shape(a)] - ORDER[shape(b)] || a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}

/** A readable label: the shortest name; else the first IP; else the first value. */
export function bestLabel(keys) {
	const sorted = sortKeys(keys);
	return sorted.length ? sorted[0] : '';
}

/** The muted line under a label: the first IP and MAC, or the first two other keys. */
export function idLine(keys) {
	const sorted = sortKeys(keys), ip = sorted.find((k) => shape(k) === 'ip'), mac = sorted.find((k) => shape(k) === 'mac');
	const out = [ip, mac].filter(Boolean);
	return (out.length ? out : sorted.slice(1, 3)).join(' · ');
}

export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** A case-insensitive "contains" matcher where * matches anything. Returns null for an empty query. */
export function wildcardRegex(q) {
	const t = String(q || '').trim();
	if (!t) return null;
	return new RegExp(t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
}

/** Whole days between an epoch (seconds) and now (ms). Null when there is no usable time. */
export function ageDays(epochSeconds, nowMs) {
	const t = Number(epochSeconds);
	if (!isFinite(t) || t <= 0) return null;
	return Math.max(0, Math.floor((nowMs - t * 1000) / 864e5));
}
export function agoText(days) {
	if (days === null || days === undefined) return '';
	return days === 0 ? 'today' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days / 30)}mo ago` : `${Math.round(days / 365)}y ago`;
}
export function freshness(days) { return days === null || days === undefined ? '' : days <= 14 ? 'fresh' : days <= 45 ? 'aging' : 'stale'; }
export function dateText(epochSeconds) { const t = Number(epochSeconds); return isFinite(t) && t > 0 ? new Date(t * 1000).toISOString().slice(0, 10) : ''; }

/** A field value as a list of strings, whatever arrived (string, array, null). Empty strings are dropped. */
export function asList(v) {
	if (v === null || v === undefined) return [];
	return (Array.isArray(v) ? v : [v]).map((x) => String(x)).filter((x) => x.length > 0);
}
export function sameValues(a, b) {
	const x = asList(a).slice().sort(), y = asList(b).slice().sort();
	return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Does a source supply the value the asset kept? A source can hold several rows for one asset with different values, so
 * it agrees when every kept value is among the ones it holds. Both are lists of strings.
 */
export function holdsValues(sourceValues, kept) {
	const have = new Set(asList(sourceValues)), want = asList(kept);
	return want.length > 0 && want.every((v) => have.has(v));
}
