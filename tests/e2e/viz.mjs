// Browser checks for the two custom visualizations, using the mock extension API (no Splunk needed).
// Run: node tests/e2e/viz.mjs   (needs: npm i --no-save playwright, and npm run build:viz first)
import assert from 'node:assert/strict';
import { openViz, sampleAssets, sampleMatrix, launch } from './viz-harness.mjs';

const browser = await launch();
let pass = 0; const ok = (m) => { pass++; console.log('  ok  ', m); };
const shot = (v, f) => v.page.screenshot({ path: `dist/viz/${f}.png` });
const noErrors = (v, what) => assert.deepEqual(v.errors, [], `${what}: console errors`);

// ---------------- heatmap ----------------
for (const theme of ['light', 'dark']) {
	const v = await openViz({ name: 'adb_heatmap', sources: { primary: sampleMatrix() }, theme, browser, height: 520 });
	const p = v.page;
	assert.equal(await p.locator('.hdr:not(.first)').count(), 7, 'one column per source');
	assert.equal(await p.locator('.rowlbl').count(), 7, 'six groups plus the pinned All row');
	assert.equal(await p.locator('.rowlbl').first().innerText().then((t) => t.split('\n')[0]), 'All assets');
	assert.equal(await p.locator('.adb').getAttribute('data-theme'), theme);
	ok(`heatmap ${theme}: renders sources, pinned row and theme`);
	if (theme === 'light') {
		await p.locator('.cell[data-r="3"][data-k="1"]').click();                       // Linux x EDR
		const ev = (await v.events())[0];
		assert.equal(ev.action, 'custom.click'); assert.deepEqual(ev.payload, { name: 'EDR', value: '64', 'row.os.value': 'Linux' });
		ok('heatmap: a click drills down directly with the source, the value and the row label');
		await p.locator('.seg button', { hasText: 'Assets' }).click();
		assert.equal((await p.locator('.cell[data-r="3"][data-k="1"]').innerText()).replace(/\s/g, ''), '593', 'Linux x EDR: 64% of 927');
		await p.locator('.seg button', { hasText: 'Percent' }).click();
		ok('heatmap: Percent / Assets switch uses the counts');
		await p.locator('.hdr:not(.first)').nth(1).click();                           // sort by EDR, descending
		const first = await p.locator('.rowlbl').nth(1).innerText();
		assert.ok(first.startsWith('Windows Server'), 'highest EDR coverage first: ' + first);
		ok('heatmap: clicking a header sorts the rows');
		await p.evaluate(() => { const hi = document.querySelectorAll('.legend input')[1]; hi.value = 50; hi.dispatchEvent(new Event('input')); });
		assert.ok(await p.locator('.cell.dim').count() > 5, 'cells above the range fade');
		ok('heatmap: the legend brush fades cells outside the range');
		await p.locator('.cell[data-r="1"][data-k="0"]').focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter');
		assert.equal((await v.events()).length, 2, 'keyboard Enter drills down too');
		ok('heatmap: keyboard navigation');
	}
	await shot(v, `heatmap-${theme}`); noErrors(v, 'heatmap'); await v.close();
}
{ // a matrix without sizes: no pinned row, no switch
	const m = sampleMatrix(); m.fields.pop(); m.columns.pop();
	const v = await openViz({ name: 'adb_heatmap', sources: { primary: m }, browser, height: 520 });
	assert.equal(await v.page.locator('.seg').count(), 0, 'no Percent / Assets switch without sizes'); assert.equal(await v.page.locator('.rowlbl').count(), 6, 'no pinned row without sizes');
	ok('heatmap: optional columns missing degrades quietly'); noErrors(v, 'heatmap-plain'); await v.close();
}
{ // each source column shows its vendor's logo: picked from the source name, or from the lookup name when the dashboard supplies the sources
	const m = { fields: ['Group', 'CrowdStrike Falcon', 'Endpoints', 'Splunk hosts', 'Wiz'].map((name) => ({ name })), columns: [['Servers', 'Desktops'], ['90', '80'], ['55', '40'], ['70', '65'], ['30', '20']] };
	const sources = { fields: [{ name: 'name' }, { name: 'lookup' }], columns: [['Endpoints'], ['assetdb_src_tenable.csv']] };
	for (const theme of ['light', 'dark']) {
		const v = await openViz({ name: 'adb_heatmap', sources: { primary: m, sources }, theme, browser, height: 360 });
		assert.equal(await v.page.locator('.hdr:not(.first) img.vicon').count(), 3, `${theme}: CrowdStrike, Tenable (from the lookup name) and Wiz have a logo`);
		assert.equal(await v.page.locator('.hdr:not(.first) .vdefault').count(), 1, `${theme}: Splunk hosts gets the default icon`);
		assert.equal(await v.page.locator('.hdr:not(.first) img.vicon').first().evaluate((i) => i.complete && i.naturalWidth > 0), true, `${theme}: the logo is drawn`);
		await shot(v, `heatmap-logos-${theme}`); noErrors(v, 'heatmap-logos'); await v.close();
	}
	const n = await openViz({ name: 'adb_heatmap', sources: { primary: m }, browser, height: 360 });
	assert.equal(await n.page.locator('.hdr:not(.first) img.vicon').count(), 2, 'without the sources only the names are read: Endpoints has no logo');
	ok('heatmap: vendor logos from the source name and the lookup name, the default icon otherwise'); noErrors(n, 'heatmap-logos-plain'); await n.close();
}
{ // many sources still render, and an empty result says so
	const m = sampleMatrix(); const extra = Array.from({ length: 6 }, (_, i) => ({ name: 'Extra source ' + i }));
	m.fields.splice(1, 0, ...extra); m.columns.splice(1, 0, ...extra.map(() => m.columns[0].map(() => '55')));
	const v = await openViz({ name: 'adb_heatmap', sources: { primary: m }, browser, height: 520 });
	assert.equal(await v.page.locator('.hdr:not(.first)').count(), 13, 'thirteen sources, none named in the visualization'); ok('heatmap: any number of sources'); await v.close();
	const e = await openViz({ name: 'adb_heatmap', sources: { primary: { fields: [], columns: [] } }, browser, height: 300 });
	assert.match(await e.page.locator('.msg').innerText(), /No data/); ok('heatmap: empty result'); await e.close();
}

// ---------------- explorer ----------------
for (const theme of ['light', 'dark']) {
	const data = sampleAssets(100, 1211);
	const v = await openViz({ name: 'adb_asset_explorer', sources: { primary: data.primary }, theme, browser, height: 900 });
	const p = v.page;
	assert.equal(await p.locator('.item').count(), 100, 'the list holds what the search returned');
	assert.match(await p.locator('[data-count]').innerText(), /100 of 1,211 assets/);
	assert.match(await p.locator('.capnote').innerText(), /first 100 of 1,211/);
	assert.equal(await p.locator('.adb').getAttribute('data-theme'), theme);
	assert.ok(await p.locator('.tile').count() > 100, 'adb_icon draws a tile in the list and the header');
	ok(`explorer ${theme}: list, count, cap note, icons, theme`);
	if (theme === 'light') {
		const first = (await v.events())[0];
		assert.equal(first.payload['click.sel'], 'key0'.length ? first.payload['click.sel'] : '', 'the first asset is selected and sent'); assert.ok(first.payload['click.sel'].startsWith('key')); assert.equal(first.payload['click.q'], '');
		ok('explorer: the selection is sent to the dashboard on load');
		await p.locator('.item').nth(5).click();
		const last = (await v.events()).pop(); assert.equal(last.payload['click.sel'], 'key' + (await p.locator('.item').nth(5).getAttribute('data-id')).slice(3)); ok('explorer: choosing an asset sends its id');
		await p.fill('[data-q]', 'berlin-*');
		const n = await p.locator('.item').count(); assert.ok(n > 0 && n < 100, 'typing narrows the loaded assets at once: ' + n);
		assert.match(await p.locator('[data-count]').innerText(), /Searching/);
		await p.waitForTimeout(700);
		const evs = await v.events(); const se = evs.pop(); assert.equal(se.payload['click.q'], 'berlin-*'); assert.equal(se.payload.name, 'search');
		assert.ok(evs.every((e) => e.payload['click.q'] === ''), 'nothing was sent while the query was still being typed');
		ok('explorer: search filters instantly, then asks the dashboard search to run');
		await v.push('primary', sampleAssets(37, 37).primary);
		assert.match(await p.locator('[data-count]').innerText(), /of 37 matches/, 'the total comes from the new results; the typed filter still applies to them'); assert.equal(await p.locator('.capnote').count(), 0);
		ok('explorer: new results replace the list and the count');
		await p.fill('[data-q]', ''); await p.waitForTimeout(600);
		await p.locator('.item').first().click();
		assert.ok(await p.locator('.fname').count() >= 5, 'user fields are listed under their own names (empty ones are folded away)'); assert.match(await p.locator('[data-empty]').innerText(), /with no value/);
		assert.equal(await p.locator('.fname').first().innerText(), 'owner');
		assert.equal(await p.locator('[data-diff]').count(), 0, 'without per-source rows nothing is claimed to differ'); assert.equal(await p.locator('.frow.hasdiff').count(), 0);
		ok('explorer: user fields, and no differences are claimed without per-source rows');
		const withProv = openViz({ name: 'adb_asset_explorer', sources: { primary: data.primary, provenance: data.provenance }, theme, browser, height: 900 });
		const w = await withProv;
		await w.page.locator('.item[data-id="key0"]').click();   // the provenance rows belong to this asset
		assert.ok(await w.page.locator('.frow.has-prov .from .badge').count() >= 3, 'each field lists its sources');
		assert.ok(await w.page.locator('.from .badge img.vicon').count() >= 1, 'a source named Active Directory or CMDB carries its vendor logo'); assert.ok(await w.page.locator('.from .badge .vdefault').count() >= 1, 'a source that names no vendor carries the default icon');
		await w.page.locator('.frow.has-prov .fmain').first().click();
		assert.ok(await w.page.locator('.frow.open .fdetail tr').count() >= 2, 'a field expands into a source by source comparison');
		assert.ok(await w.page.locator('.fdetail .st-diff').count() >= 1, 'the source that disagrees is marked'); assert.ok(await w.page.locator('.fdetail .st-used').count() >= 1, 'one agreeing source is marked as used');
		await w.page.locator('.item[data-id="key1"]').click();   // rows stamped with key0 must not be shown for another asset
		assert.equal(await w.page.locator('.frow.has-prov').count(), 0, 'provenance for another asset is ignored');
		// while the sources of the new asset are awaited there is a skeleton, never the "not available" note; the note only comes if they never arrive
		assert.ok(await w.page.locator('.from .skel').count() >= 3, 'a skeleton stands where the sources will be'); assert.equal(await w.page.locator('.note').count(), 0, 'no false note while waiting');
		await w.page.waitForTimeout(6500);
		assert.equal(await w.page.locator('.from .skel').count(), 0); assert.match(await w.page.locator('.note').innerText(), /not available/);
		await w.page.locator('.item[data-id="key0"]').click();
		assert.equal(await w.page.locator('.note').count(), 0, 'the note goes when the asset has sources'); 
		assert.ok(await w.page.locator('.frow.has-prov').count() >= 3);
		{ const tag = w.page.locator('[data-diff]'); assert.equal(await tag.count(), 1, 'the asset has fields that differ'); const n = parseInt(await tag.innerText(), 10); await tag.click();
		  assert.equal(await w.page.locator('.frow').count(), n, 'the tag counts exactly the fields the list shows'); assert.equal(await w.page.locator('.frow.hasdiff').count(), n); await tag.click(); }
		await shot(w, 'explorer-provenance'); noErrors(w, 'explorer-prov'); await w.close();
		ok('explorer: per-source provenance lists sources, expands, and marks differences');
		await p.locator('.key').first().click(); assert.match(await p.locator('[data-toast]').innerText(), /Copied/); ok('explorer: click a key to copy');
		await p.locator('.frow .fmain').nth(0).click(); // no provenance on this instance: nothing opens
	}
	await shot(v, `explorer-${theme}`); noErrors(v, 'explorer'); await v.close();
}
{ // no icon column: every asset gets the default icon; no data: a message; keys only
	const d = sampleAssets(20, 20); const i = d.primary.fields.findIndex((f) => f.name === 'adb_icon'); d.primary.fields.splice(i, 1); d.primary.columns.splice(i, 1);
	const v = await openViz({ name: 'adb_asset_explorer', sources: { primary: d.primary }, browser, height: 700 });
	assert.ok(await v.page.locator('.tile').count() > 20, 'without adb_icon every asset still has the default icon'); ok('explorer: no icon column, default icon'); await v.close();
	const e = await openViz({ name: 'adb_asset_explorer', sources: { primary: { fields: [], columns: [] } }, browser, height: 300 });
	assert.match(await e.page.locator('.msg').innerText(), /No data/); ok('explorer: empty result'); await e.close();
}
await browser.close();
console.log(`\n${pass} checks passed`);
