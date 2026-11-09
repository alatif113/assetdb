// Source colors: ten, assigned in source order and rotated after that. The name always sits beside the color.
export const PALETTE_SIZE = 10;

/** Source order: the configured order when given, then the remaining names alphabetically. */
export function sourceOrder(names, configured) {
	const seen = new Set(), out = [];
	(configured || []).forEach((n) => { if (!seen.has(n)) { seen.add(n); out.push(n); } });
	Array.from(new Set(names)).filter((n) => !seen.has(n)).sort((a, b) => a.localeCompare(b)).forEach((n) => out.push(n));
	return out;
}
/** CSS variable for a source, e.g. var(--s3). */
export function sourceColor(name, order) {
	const i = order.indexOf(name);
	return `var(--s${((i < 0 ? 0 : i) % PALETTE_SIZE) + 1})`;
}
