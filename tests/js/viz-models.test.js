// Pure logic behind the custom visualizations (viz/shared/*.mjs). The DOM code is checked in a browser, not here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'viz', 'shared', f)).href);

test('shape tells names, IPs and MACs apart without any field name', async () => {
	const { shape } = await load('util.mjs');
	assert.strictEqual(shape('10.4.2.17'), 'ip');
	assert.strictEqual(shape('fe80::1ff:fe23:4567:890a'), 'ip');
	assert.strictEqual(shape('00:aa:bb:cc:dd:01'), 'mac');
	assert.strictEqual(shape('00-aa-bb-cc-dd-01'), 'mac');
	assert.strictEqual(shape('0011223344aa'), 'mac');
	assert.strictEqual(shape('web-01'), 'name');
	assert.strictEqual(shape('web-01.corp.example.com'), 'name');
});

test('the label prefers the shortest name, then an IP, then anything', async () => {
	const { bestLabel, idLine, sortKeys } = await load('util.mjs');
	assert.strictEqual(bestLabel(['00:aa:bb:cc:dd:01', '10.1.1.1', 'web-01.corp.example.com', 'web-01']), 'web-01');
	assert.strictEqual(bestLabel(['00:aa:bb:cc:dd:01', '10.1.1.1', '10.1.1.2']), '10.1.1.1');
	assert.strictEqual(bestLabel(['00:aa:bb:cc:dd:01']), '00:aa:bb:cc:dd:01');
	assert.strictEqual(bestLabel([]), '');
	assert.deepStrictEqual(sortKeys(['00:aa:bb:cc:dd:01', '10.1.1.1', 'b-host', 'a']), ['a', 'b-host', '10.1.1.1', '00:aa:bb:cc:dd:01']);
	assert.strictEqual(idLine(['web-01', '10.1.1.1', '00:aa:bb:cc:dd:01']), '10.1.1.1 · 00:aa:bb:cc:dd:01');
	assert.strictEqual(idLine(['web-01', 'web-01.corp', 'web-01-b']), 'web-01-b · web-01.corp', 'no IP or MAC: the next two keys after the label');
});

test('wildcard search is a case-insensitive contains match with * as a wildcard', async () => {
	const { wildcardRegex } = await load('util.mjs');
	assert.strictEqual(wildcardRegex('   '), null);
	assert.ok(wildcardRegex('web-*').test('my-web-01'));
	assert.ok(wildcardRegex('10.4.*').test('10.4.56.82'));
	assert.ok(!wildcardRegex('10.4.').test('10x4x'), 'a dot is a dot, not any character');
	assert.ok(wildcardRegex('WEB').test('web-01'));
	assert.ok(!wildcardRegex('a(b').test('ab'), 'regex characters are literal');
});

test('age, freshness and list helpers', async () => {
	const { ageDays, agoText, freshness, asList, sameValues, holdsValues } = await load('util.mjs');
	const now = Date.UTC(2026, 10, 8);
	assert.strictEqual(ageDays(String(now / 1000), now), 0);
	assert.strictEqual(ageDays(String(now / 1000 - 3 * 86400), now), 3);
	assert.strictEqual(ageDays('', now), null);
	assert.strictEqual(ageDays('abc', now), null);
	assert.strictEqual(agoText(0), 'today'); assert.strictEqual(agoText(12), '12d ago'); assert.strictEqual(agoText(90), '3mo ago'); assert.strictEqual(agoText(800), '2y ago');
	assert.strictEqual(freshness(14), 'fresh'); assert.strictEqual(freshness(15), 'aging'); assert.strictEqual(freshness(46), 'stale'); assert.strictEqual(freshness(null), '');
	assert.deepStrictEqual(asList(['a', '', 'b']), ['a', 'b']); assert.deepStrictEqual(asList(null), []); assert.deepStrictEqual(asList('x'), ['x']);
	assert.ok(sameValues(['b', 'a'], ['a', 'b'])); assert.ok(!sameValues(['a'], ['a', 'b']));
	assert.ok(holdsValues(['a', 'b', 'c'], ['a', 'b'])); assert.ok(!holdsValues(['a'], ['a', 'b'])); assert.ok(!holdsValues(['a'], []));
});

test('magma ramp runs from black to cream and text stays readable', async () => {
	const { ramp, ink, MAGMA } = await load('ramp.mjs');
	assert.deepStrictEqual(ramp(0), [0, 0, 4]);
	assert.deepStrictEqual(ramp(1), [252, 253, 191]);
	assert.deepStrictEqual(ramp(NaN), [0, 0, 4]);
	assert.deepStrictEqual(ramp(5), ramp(1), 'out of range is clamped');
	assert.strictEqual(MAGMA.length, 10);
	assert.strictEqual(ink(ramp(0)), '#ffffff'); assert.strictEqual(ink(ramp(1)), '#13171a');
});

test('source colors: ten, in order, rotating after ten', async () => {
	const { sourceOrder, sourceColor, PALETTE_SIZE } = await load('palette.mjs');
	assert.strictEqual(PALETTE_SIZE, 10);
	assert.deepStrictEqual(sourceOrder(['b', 'a', 'c', 'a']), ['a', 'b', 'c']);
	assert.deepStrictEqual(sourceOrder(['b', 'a', 'c'], ['c', 'x']), ['c', 'x', 'a', 'b'], 'configured order first, then the rest');
	const names = Array.from({ length: 12 }, (_, i) => 's' + String(i).padStart(2, '0')), order = sourceOrder(names);
	assert.strictEqual(sourceColor('s00', order), 'var(--s1)');
	assert.strictEqual(sourceColor('s09', order), 'var(--s10)');
	assert.strictEqual(sourceColor('s10', order), 'var(--s1)', 'the 11th source reuses the first color');
});

test('icon names: a fixed vocabulary and a neutral fallback', async () => {
	const { ICON_NAMES, iconSvg, ICONS } = await load('icons.mjs');
	assert.ok(ICON_NAMES.includes('server') && ICON_NAMES.includes('other'));
	assert.strictEqual(iconSvg('nonsense'), ICONS.other);
	ICON_NAMES.forEach((n) => assert.ok(/^<svg /.test(ICONS[n]), n));
});

test('matrix: first column labels rows, other columns are series, adb_ columns are not series', async () => {
	const { parseMatrix, allRow, columnAverages, sortRows } = await load('matrix.mjs');
	const data = {
		fields: [{ name: 'Group' }, { name: 'CMDB' }, { name: 'EDR' }, { name: 'adb_total' }, { name: 'CMDB__n' }, { name: '_time' }],
		columns: [['Windows', 'Linux'], ['90', '50'], ['10', ''], ['100', '300'], ['90', '150'], ['x', 'y']],
	};
	const m = parseMatrix(data);
	assert.strictEqual(m.rowField, 'Group');
	assert.deepStrictEqual(m.series.map((s) => s.name), ['CMDB', 'EDR']);
	assert.deepStrictEqual(m.rows.map((r) => r.total), [100, 300]);
	assert.deepStrictEqual(m.rows[0].counts, [90, 10], 'an exact count column wins; otherwise the count is derived from the percent and the size');
	assert.ok(isNaN(m.rows[1].values[1]), 'an empty cell is not a number');
	const all = allRow(m, 'All assets');
	assert.strictEqual(all.total, 400);
	assert.strictEqual(all.values[0], 60, '(90*100 + 50*300) / 400');
	assert.strictEqual(all.values[1], 10, 'rows without a value do not pull the weighted average down');
	assert.deepStrictEqual(columnAverages(m), [70, 10]);
	assert.deepStrictEqual(sortRows(m.rows, { key: 0, dir: -1 }).map((r) => r.label), ['Windows', 'Linux']);
	assert.deepStrictEqual(sortRows(m.rows, { key: 'size', dir: -1 }).map((r) => r.label), ['Linux', 'Windows']);
	assert.deepStrictEqual(sortRows(m.rows, { key: null }).map((r) => r.label), ['Windows', 'Linux'], 'no sort keeps the search order');
	assert.strictEqual(parseMatrix({ fields: [], columns: [] }), null);
	assert.strictEqual(allRow(parseMatrix({ fields: [{ name: 'g' }, { name: 'a' }], columns: [['x'], ['5']] })), null, 'no sizes, no pinned row');
});

test('assets: reserved columns are read, every other column is a user field', async () => {
	const { parseAssets, filterAssets, sortAssets, RESERVED } = await load('assets.mjs');
	const now = Date.UTC(2026, 10, 8), sec = (d) => String(now / 1000 - d * 86400);
	const data = {
		fields: ['adb_id', 'asset', 'source', 'conflicts', 'last_seen', 'adb_icon', 'adb_total', 'owner', 'category', '_raw'].map((name) => ({ name })),
		columns: [
			['k1', 'k2'], [['00:aa:bb:cc:dd:01', '10.1.1.1', 'web-01'], ['10.2.2.2']], [['CMDB', 'EDR'], 'CMDB'], [['owner'], []], [sec(3), sec(40)],
			['server', ''], ['1211', '1211'], ['Fred', 'Nancy'], [['a', 'b'], 'c'], ['x', 'y'],
		],
	};
	const r = parseAssets(data, now);
	assert.strictEqual(r.total, 1211);
	assert.deepStrictEqual(r.fieldNames, ['owner', 'category'], 'reserved and internal columns are not user fields');
	assert.strictEqual(r.assets[0].label, 'web-01');
	assert.strictEqual(r.assets[0].days, 3);
	assert.deepStrictEqual(r.assets[0].sources, ['CMDB', 'EDR']);
	assert.ok(r.assets[0].conflicts.has('owner') && r.assets[1].conflicts.size === 0);
	assert.strictEqual(r.assets[0].icon, 'server'); assert.strictEqual(r.assets[1].icon, '');
	assert.deepStrictEqual(r.assets[0].fields.category, ['a', 'b']);
	assert.strictEqual(r.assets[1].label, '10.2.2.2');
	assert.ok(RESERVED.has('adb_icon') && RESERVED.has('conflicts'));
	assert.deepStrictEqual(filterAssets(r.assets, '10.2.*').map((a) => a.id), ['k2']);
	assert.strictEqual(filterAssets(r.assets, '').length, 2);
	assert.deepStrictEqual(sortAssets(r.assets, 'seen').map((a) => a.id), ['k1', 'k2']);
	assert.deepStrictEqual(sortAssets(r.assets, 'sources').map((a) => a.id), ['k1', 'k2']);
	assert.strictEqual(parseAssets(null, now).assets.length, 0);
	assert.strictEqual(parseAssets({ fields: [{ name: 'adb_id' }], columns: [['a', 'b']] }, now).total, 2, 'without adb_total the total is what was loaded');
});

test('provenance: sources are compared with each other, and with the value of the asset when it is known', async () => {
	const { buildProvenance } = await load('provenance.mjs');
	const rows = [
		{ source: 'CMDB', field: 'owner', value: 'Fred', seen: '100' }, { source: 'EDR', field: 'owner', value: 'Nancy', seen: '300' },
		{ source: 'MDM', field: 'owner', value: ['Nancy'], seen: '200' }, { source: 'DHCP', field: 'os', value: 'Mac', seen: '50' },
	];
	const p = buildProvenance(rows);
	assert.deepStrictEqual(p.owner.map((e) => [e.s, e.st, !!e.used]), [['EDR', 'agree', true], ['MDM', 'agree', false], ['CMDB', 'differ', false]]);
	assert.deepStrictEqual(p.os.map((e) => [e.s, e.st, !!e.used]), [['DHCP', 'agree', true]], 'one source never differs');
	assert.deepStrictEqual(buildProvenance([]), {});
	// copies of each other never differ, whatever case, spacing or order their values come in
	const copies = buildProvenance([{ source: 'A', field: 'mac', value: ['AA:BB', 'cc:dd'], seen: '2' }, { source: 'B', field: 'mac', value: ['cc:dd ', 'aa:bb'], seen: '1' }]);
	assert.deepStrictEqual(copies.mac.map((e) => e.st), ['agree', 'agree']);
	// a source holding other values than the newest differs
	const multi = buildProvenance([{ source: 'CMDB', field: 'bunit', value: ['tax', 'accounting'], seen: '10' }, { source: 'EDR', field: 'bunit', value: 'hr', seen: '20' }]);
	assert.deepStrictEqual(multi.bunit.map((e) => [e.s, e.st]), [['EDR', 'agree'], ['CMDB', 'differ']]);
});

test('a source differs when its value is not the final value, and agrees when it is', async () => {
	const { buildProvenance } = await load('provenance.mjs');
	// asset denver_android_56: the asset keeps "Toronto"; two sources hold "Newcastle upon Tyne" and "Toronto", a third (older) one holds "Toronto"
	const rows = [
		{ source: 'demo assets 2', field: 'city', value: ['Newcastle upon Tyne', 'Toronto'], seen: 1631984027 },
		{ source: 'demo_assets', field: 'city', value: ['Newcastle upon Tyne', 'Toronto'], seen: 1631984027 },
		{ source: 'tanium', field: 'city', value: ['Toronto'], seen: 0 },
	];
	const p = buildProvenance(rows, { city: ['Toronto'] });
	assert.deepStrictEqual(p.city.map((x) => [x.s, x.st, !!x.used]), [['tanium', 'agree', true], ['demo assets 2', 'differ', false], ['demo_assets', 'differ', false]]);
});

test('case, spacing, order and repeats do not make a source differ; another value does', async () => {
	const { buildProvenance } = await load('provenance.mjs');
	const rows = [{ source: 'a', field: 'city', value: ['Toronto'], seen: 30 }, { source: 'b', field: 'city', value: [' TORONTO '], seen: 20 }, { source: 'c', field: 'city', value: ['Oslo'], seen: 10 }];
	assert.deepStrictEqual(buildProvenance(rows, { city: ['toronto'] }).city.map((x) => [x.s, x.st, !!x.used]), [['a', 'agree', true], ['b', 'agree', false], ['c', 'differ', false]]);
	const mv = buildProvenance([{ source: 'a', field: 'ip', value: ['2.2.2.2', '1.1.1.1', '1.1.1.1'], seen: 9 }, { source: 'b', field: 'ip', value: ['1.1.1.1'], seen: 5 }], { ip: ['1.1.1.1', '2.2.2.2'] });
	assert.deepStrictEqual(mv.ip.map((x) => [x.s, x.st]), [['a', 'agree'], ['b', 'agree']], 'the same set in another order agrees, and so does a part of it');
	const extra = buildProvenance([{ source: 'a', field: 'ip', value: ['1.1.1.1', '9.9.9.9'], seen: 9 }, { source: 'b', field: 'ip', value: [], seen: 5 }], { ip: ['1.1.1.1', '2.2.2.2'] });
	assert.deepStrictEqual(extra.ip.map((x) => [x.s, x.st]), [['a', 'differ'], ['b', 'differ']], 'a value the final lacks, or no value, differs');
	// nothing agrees with the final value: no source is marked as used
	assert.strictEqual(buildProvenance([{ source: 'a', field: 'x', value: ['1'], seen: 2 }], { x: ['9'] }).x.some((e) => e.used), false);
	// without a final value the sources are compared with the newest one
	const none = buildProvenance([{ source: 'a', field: 'x', value: ['1'], seen: 2 }, { source: 'b', field: 'x', value: ['2'], seen: 1 }], { x: [''] });
	assert.deepStrictEqual(none.x.map((e) => [e.s, e.st]), [['a', 'agree'], ['b', 'differ']]);
});

test('an adb_all row is the pinned All row and not a group, so a field with several values does not inflate the total', async () => {
	const { parseMatrix, allRow } = await load('matrix.mjs');
	// two groups that overlap (an asset with both tags is in both): 6 + 5 group members, but 8 assets
	const m = parseMatrix({ fields: ['Group', 'EDR', 'adb_total'].map((name) => ({ name })), columns: [['adb_all', 'pci', 'dmz'], ['50', '100', '20'], ['8', '6', '5']] });
	assert.deepStrictEqual(m.rows.map((r) => r.label), ['pci', 'dmz']);
	const top = allRow(m, 'All assets');
	assert.strictEqual(top.total, 8); assert.deepStrictEqual(top.values, [50]); assert.deepStrictEqual(top.counts, [4]); assert.strictEqual(top.pinned, true);
	// without it the row is the weighted average of the groups, as before
	const plain = parseMatrix({ fields: ['Group', 'EDR', 'adb_total'].map((name) => ({ name })), columns: [['a', 'b'], ['100', '0'], ['6', '4']] });
	assert.strictEqual(allRow(plain, 'All').total, 10); assert.deepStrictEqual(allRow(plain, 'All').values, [60]);
});
