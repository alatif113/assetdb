// Renders the real search results of the comprehensive estate (tests/integration/test_comprehensive.py with ADB_DUMP set) in the Explorer and Coverage
// visualizations and checks the screen against what the merge produced.
// Run: ADB_DUMP=dist/comprehensive (cd tests/integration && ../../.venv/bin/python -m pytest test_comprehensive.py) && node tests/e2e/comprehensive.mjs
// Needs: npm i --no-save playwright, and npm run build:viz.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openViz, launch } from './viz-harness.mjs';

const file = process.argv[2] || 'dist/comprehensive/comprehensive.json';
const data = JSON.parse(readFileSync(file, 'utf8'));
const browser = await launch();
let pass = 0; const ok = (m) => { pass++; console.log('  ok  ', m); };

// Splunk rows (objects) -> the { fields, columns } shape of a Dashboard Studio data source. Multivalue cells stay arrays.
const table = (rows, drop = ['_key', '_mkv_child'], extra = {}) => {
	const names = []; rows.forEach((r) => Object.keys(r).forEach((k) => { if (!names.includes(k) && !drop.includes(k)) names.push(k); }));
	Object.keys(extra).forEach((k) => names.push(k));
	return { fields: names.map((name) => ({ name })), columns: names.map((n) => rows.map((r) => (n in extra ? extra[n] : (r[n] === undefined ? '' : r[n])))) };
};
const sources = table(data.sources.map((s) => ({ name: s.name, lookup: s.lookup })));
const num = (s) => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const canon = (x) => { const t = String(x).trim().toLowerCase(); return Number.isFinite(Number(t)) && t !== '' ? String(Number(t)) : t; };

// ---------------- Coverage: every cell of every grouping ----------------
for (const [by, rows] of Object.entries(data.coverage)) {
	const v = await openViz({ name: 'adb_heatmap', sources: { primary: table(rows, []), sources }, theme: 'dark', browser, width: 1700, height: 900 });
	const p = v.page;
	const groups = rows.filter((r) => r.Group !== 'adb_all');                       // adb_all is the pinned row, not a group
	const srcNames = Object.keys(rows[0]).filter((k) => k !== 'Group' && k !== 'adb_total');
	const heads = await p.locator('.hdr:not(.first) .nm span:not(.src):not(.arrow)').allInnerTexts();
	assert.deepEqual(heads.map((h) => h.trim()).filter(Boolean).sort(), srcNames.slice().sort(), `${by}: one column per source, and no column for the disabled source`);
	assert.ok(!heads.some((h) => /Legacy/.test(h)), 'the disabled source is not a column');
	const labels = (await p.locator('.rowlbl').allInnerTexts()).map((t) => t.split('\n')[0].trim());
	assert.equal(labels[0], 'All assets', 'the pinned row');
	if (by === 'No grouping') assert.deepEqual(labels, ['All assets'], 'ungrouped: the pinned row is the only row'); else assert.deepEqual(labels.slice(1).sort(), groups.map((r) => r.Group).sort(), `${by}: one row per group`);
	const seen = {}; const aria = await p.locator('.cell:not(.empty)').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
	const emptyCount = await p.locator('.cell.empty').count();
	aria.forEach((t) => { const m = /^(.*), (.*): ([\d.]+)% covered(?:, (\d+) of (\d+) assets)?$/.exec(t); assert.ok(m, 'cell label: ' + t); seen[m[1] + '\u0001' + m[2]] = { pct: num(m[3]), n: m[4] === undefined ? null : +m[4], of: m[5] === undefined ? null : +m[5] }; });
	let checked = 0, nonzero = 0;
	const pinnedRow = rows.find((r) => r.Group === 'adb_all');
	for (const r of rows) for (const s of srcNames) {
		const g = r.Group === 'adb_all' ? 'All assets' : r.Group;
		const want = num(r[s]), c = seen[g + '\u0001' + s];
		if (want === 0 && !c) continue;                               // an all-zero cell may be drawn empty
		assert.ok(c, `${by}: cell ${g} x ${s} is missing`);
		assert.ok(Math.abs(c.pct - want) < (r.Group === 'adb_all' ? 0.51 : 0.011), `${by}: ${g} x ${s}: screen ${c.pct}%, search ${want}%`);
		if (c.of !== null) { assert.equal(c.of, num(r.adb_total), `${by}: ${g} size`); assert.ok(Math.abs(Math.round(want * c.of / 100) - c.n) <= 1, `${by}: ${g} x ${s}: ${c.n} of ${c.of} is not ${want}%`); }
		checked++; if (want > 0) nonzero++;
	}
	const pinned = labels[0] === 'All assets' ? await p.locator('.rowlbl').first().innerText() : '';
	assert.match(pinned.replace(/,/g, ''), new RegExp(`${data.total} assets`), `${by}: the pinned row counts every asset once, not the sum of the groups`);
	ok(`coverage by ${by}: ${groups.length} groups x ${srcNames.length} sources, ${checked} cells match the search (${nonzero} non zero)`);
	assert.deepEqual(v.errors, [], 'console errors'); await v.close();
}
{ // grouping by nothing: the one row has the share of every source; a click drills down with the source and the group
	const rows = data.coverage['No grouping'];
	const v = await openViz({ name: 'adb_heatmap', sources: { primary: table(rows, []), sources }, theme: 'light', browser, width: 1700, height: 500 });
	await v.page.locator('.cell:not(.empty)').first().click();
	const ev = (await v.events())[0];
	assert.equal(ev.action, 'custom.click'); assert.ok(ev.payload.name && ev.payload.name !== 'search', 'the drill-down names a source');
	ok('coverage: a click drills down with the source and the group'); await v.close();
}

// ---------------- Explorer ----------------
const nameOf = (a) => a.asset[0];
{ // the list of the newest assets with the real count
	const assets = data.explorer.assets;
	const v = await openViz({ name: 'adb_asset_explorer', sources: { primary: table(assets, ['_key', '_mkv_child'], { adb_total: String(data.total) }), sources }, theme: 'dark', browser, width: 1500, height: 950 });
	const p = v.page;
	assert.equal(await p.locator('.item').count(), assets.length);
	assert.match((await p.locator('[data-count]').innerText()).replace(/,/g, ''), new RegExp(`${assets.length} of ${data.total} assets`));
	assert.match((await p.locator('.capnote').innerText()).replace(/,/g, ''), new RegExp(`first ${assets.length} of ${data.total}`));
	const seenOf = Object.fromEntries(assets.map((a) => [a.adb_id, Number(a.last_seen)]));
	const order = (await p.locator('.item').evaluateAll((els) => els.map((e) => e.dataset.id))).map((id) => seenOf[id]);
	assert.equal(order[0], seenOf[assets[0].adb_id], 'the most recently seen asset is first (assets seen at the same second may swap)');
	assert.deepEqual(order, order.slice().sort((x, y) => y - x), 'newest first all the way down');
	ok(`explorer: ${assets.length} of ${data.total} assets, newest first, with the cap note`);
	assert.deepEqual(v.errors, [], 'console errors'); await v.close();
}
for (const pick of data.picks) {
	const rows = pick.asset_rows.filter((r) => r.adb_id === pick.key);
	assert.equal(rows.length, 1, 'the asset is found by its key');
	const v = await openViz({ name: 'adb_asset_explorer', sources: { primary: table(pick.asset_rows, ['_key', '_mkv_child'], { adb_total: String(pick.asset_total) }), provenance: table(pick.prov, []), sources }, theme: 'dark', browser, width: 1500, height: 950 });
	const p = v.page;
	await p.locator(`.item[data-id="${pick.key}"]`).click();
	await p.waitForTimeout(150);
	const label = nameOf(pick);
	// the sources of the asset
	const srcText = await p.locator('.dhead .sub').innerText();
	const m = /(\d+) (?:of \d+ )?sources?/.exec(srcText); assert.ok(m, 'source count text: ' + srcText);
	assert.equal(+m[1], pick.sources.length, `${label}: number of sources`);
	// the final values, field by field
	const shown = await p.locator('.frow').evaluateAll((els) => els.map((e) => ({ n: e.querySelector('.fname').textContent, v: [...e.querySelectorAll('.fval, .vchip')].map((x) => x.textContent), more: (e.querySelector('button.more[data-more]') || {}).textContent || '' })));
	if (await p.locator('[data-empty]').count()) await p.locator('[data-empty]').click();
	const all = await p.locator('.frow').evaluateAll((els) => els.map((e) => ({ n: e.querySelector('.fname').textContent, v: [...e.querySelectorAll('.fval, .vchip')].map((x) => x.textContent) })));
	const byName = Object.fromEntries(all.map((r) => [r.n, r.v.filter((x) => x !== '—')]));
	let compared = 0;
	for (const [f, want] of Object.entries(pick.final)) {
		const got = byName[f];
		if (want.length === 0) { assert.ok(!got || got.length === 0, `${label}: ${f} should be empty, shows ${got}`); continue; }
		assert.ok(got, `${label}: field ${f} is not listed`);
		const w = want.map(canon), g = got.map(canon);
		if (want.length > 3) assert.deepEqual(g, w.slice(0, 3), `${label}: ${f} (first chips)`); else assert.deepEqual(g.slice().sort(), w.slice().sort(), `${label}: ${f}`);
		compared++;
	}
	assert.match(await p.locator('.fhead .ct').innerText(), new RegExp(`^${Object.values(pick.final).filter((x) => x.length).length} with a value`), `${label}: the count of fields with a value`);
	// which sources the screen lists for each field: every source in the provenance rows of that field
	const provByField = {}; pick.prov.forEach((r) => { (provByField[r.field] = provByField[r.field] || new Set()).add(r.source); });
	const listed = await p.locator('.frow.has-prov').evaluateAll((els) => els.map((e) => ({ n: e.querySelector('.fname').textContent, from: [...e.querySelectorAll('.from .badge')].map((b) => b.textContent.replace('≠', '').trim()), open: e.querySelector('.more[data-from]') ? +e.querySelector('.more[data-from]').textContent.replace(/\D/g, '') : 0 })));
	for (const r of listed) {
		const want = provByField[r.n] || new Set();
		assert.equal(r.from.length + r.open, want.size, `${label}: ${r.n} lists ${want.size} sources`);
		r.from.forEach((s) => assert.ok(want.has(s), `${label}: ${r.n}: ${s} is not a source of this field`));
	}
	// the "N fields differ" tag counts exactly the fields where a source disagrees with the final value, and the list it opens shows them
	const tag = p.locator('[data-diff]');
	const wantDiff = pick.diff_fields.filter((f) => pick.final[f] && pick.final[f].length);
	if (wantDiff.length) {
		assert.equal(await tag.count(), 1, `${label}: the differing fields are announced`);
		assert.equal(parseInt(await tag.innerText(), 10), wantDiff.length, `${label}: ${wantDiff.length} fields differ (${wantDiff})`);
		await tag.click();
		const names = (await p.locator('.frow .fname').allInnerTexts()).sort();
		assert.deepEqual(names, wantDiff.slice().sort(), `${label}: the list of differing fields`);
		assert.equal(await p.locator('.frow.hasdiff').count(), wantDiff.length);
		await tag.click();
	} else {
		assert.equal(await tag.count(), 0, `${label}: nothing differs, so no tag`);
	}
	// conflicts flagged by the merge: shown for the field and in the asset
	ok(`explorer ${label}: ${pick.sources.length} sources, ${compared} field values, ${wantDiff.length} differing fields`);
	assert.deepEqual(v.errors, [], `console errors for ${label}`); await v.close();
}
await browser.close();
console.log(`\n${pass} checks passed`);
