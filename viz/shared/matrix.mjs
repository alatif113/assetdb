import { asList } from './util.mjs';

/**
 * The heatmap's data contract: column 1 labels the rows and every other column is a series of numbers from 0 to 100.
 * Two kinds of column are optional and never drawn as series:
 *   adb_total   the number of assets in the row
 *   <name>__n   how many assets that series covers in the row
 * Anything else starting with "_" is ignored (Splunk internal fields).
 * A row labelled adb_all counts every asset once. It is the pinned "All" row, and is not a group: grouped by a field with several values an
 * asset sits in several groups, so the groups add up to more than the assets.
 */
export const ALL_ROW = 'adb_all';
export function parseMatrix(data) {
	if (!data || !data.fields || !data.columns || !data.columns.length || !data.columns[0].length) return null;
	const names = data.fields.map((f) => (f && f.name) || String(f));
	const cell = (c, r) => { const v = data.columns[c][r]; return Array.isArray(v) ? v[0] : v; };
	const num = (v) => { if (v === null || v === undefined || v === '') return NaN; const n = Number(v); return isFinite(n) ? n : NaN; };
	const series = [], countCol = {}; let totalCol = -1;
	names.forEach((n, i) => {
		if (i === 0) return;
		if (n === 'adb_total') totalCol = i; else if (/__n$/.test(n)) countCol[n.slice(0, -3)] = i; else if (!n.startsWith('_')) series.push({ name: n, col: i });
	});
	const rows = [];
	for (let r = 0; r < data.columns[0].length; r++) {
		const total = totalCol >= 0 ? num(cell(totalCol, r)) : NaN;
		const values = series.map((s) => num(cell(s.col, r)));
		const counts = series.map((s, k) => {
			if (countCol[s.name] !== undefined) return num(cell(countCol[s.name], r));
			return isNaN(total) || isNaN(values[k]) ? NaN : Math.round(values[k] * total / 100);
		});
		rows.push({ label: String(asList(cell(0, r))[0] || ''), total: isNaN(total) ? null : total, values, counts });
	}
	const hasTotal = totalCol >= 0;
	const at = rows.findIndex((r) => r.label === ALL_ROW), all = at >= 0 ? rows.splice(at, 1)[0] : null;
	return { rowField: names[0], series, rows, all, hasTotal, hasCounts: hasTotal || Object.keys(countCol).length > 0 };
}

const mean = (a) => { const v = a.filter((x) => !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };

/** A pinned "All" row: the adb_all row when the data has one, otherwise the average of each series weighted by row size. Needs adb_total. */
export function allRow(model, label) {
	if (!model.hasTotal) return null;
	if (model.all && model.all.total) return { label: label || 'All', total: model.all.total, values: model.all.values.map((v) => (isNaN(v) ? NaN : Math.round(v))), counts: model.all.counts, pinned: true };
	const total = model.rows.reduce((s, r) => s + (r.total || 0), 0);
	if (!total) return null;
	const values = model.series.map((_, k) => {
		const ok = model.rows.filter((r) => !isNaN(r.values[k]) && r.total);
		const w = ok.reduce((s, r) => s + r.total, 0);
		return w ? Math.round(ok.reduce((s, r) => s + r.values[k] * r.total, 0) / w) : NaN;
	});
	const counts = model.series.map((_, k) => model.rows.reduce((s, r) => s + (isNaN(r.counts[k]) ? 0 : r.counts[k]), 0));
	return { label: label || 'All', total, values, counts, pinned: true };
}

export function columnAverages(model) { return model.series.map((_, k) => Math.round(mean(model.rows.map((r) => r.values[k])))); }

/** sort = { key: null | 'name' | 'size' | <series index>, dir: 1 | -1 }. Does not change the input. */
export function sortRows(rows, sort) {
	const r = rows.slice(), k = sort && sort.key, d = (sort && sort.dir) || 1;
	if (k === null || k === undefined) return r;
	if (k === 'name') return r.sort((a, b) => d * a.label.localeCompare(b.label));
	if (k === 'size') return r.sort((a, b) => d * ((a.total || 0) - (b.total || 0)));
	return r.sort((a, b) => d * ((isNaN(a.values[k]) ? -1 : a.values[k]) - (isNaN(b.values[k]) ? -1 : b.values[k])));
}
