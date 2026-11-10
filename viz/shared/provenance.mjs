import { asList } from './util.mjs';

// What a source holds for a field, for comparing: trimmed, lowercase, de-duplicated, order ignored.
const norm = (v) => Array.from(new Set(asList(v).map((x) => String(x).trim().toLowerCase()).filter(Boolean))).sort();
const sig = (v) => norm(v).join('\u0001');

/**
 * Per-field provenance for one asset, from rows of (source, field, value, seen) and the asset's final values (`finals`: { field: [values] },
 * what the merge kept). A source "agrees" when everything it holds is part of the final value (ignoring case, spacing, order and repeats,
 * so a source with one of several final IPs agrees) and "differs" when it holds a value the final one lacks or nothing at all. When the asset has no final value for a field there is nothing to match, and the sources are compared with
 * the newest one instead. `used` marks the newest source that agrees (the newest source when none does and there is no final value).
 * Returns { [field]: [{ s, v, seen, st, used }] }: the agreeing sources newest first, then the ones that differ newest first.
 */
export function buildProvenance(rows, finals) {
	const byField = {};
	(rows || []).forEach((r) => {
		const f = r.field; if (!f) return;
		(byField[f] = byField[f] || []).push({ s: r.source, v: asList(r.value), seen: Number(r.seen) || 0 });
	});
	const out = {};
	Object.keys(byField).forEach((f) => {
		const ent = byField[f].sort((a, b) => b.seen - a.seen);
		const fin = finals && finals[f] ? asList(finals[f]).filter((x) => String(x).trim() !== '') : [];
		const finSet = new Set(norm(fin));
		const ref = fin.length ? '' : sig(ent[0].v);
		ent.forEach((e) => {
			const n = norm(e.v);
			e.st = (fin.length ? n.length > 0 && n.every((x) => finSet.has(x)) : sig(e.v) === ref) ? 'agree' : 'differ';
		});
		const agreeing = ent.filter((e) => e.st === 'agree');
		if (agreeing.length) agreeing[0].used = true;
		out[f] = agreeing.concat(ent.filter((e) => e.st === 'differ'));
	});
	return out;
}
