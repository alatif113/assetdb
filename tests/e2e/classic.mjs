// The classic-dashboard build of the visualizations (appserver/static/js/classic/<name>.min.js): the bundle runs in an iframe like the one
// adb_frame.js creates, is fed by postMessage and sends its drilldown back the same way (no Splunk needed).
// Run: node tests/e2e/classic.mjs   (needs Playwright and npm run build:viz first)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sampleAssets, sampleMatrix } from './viz-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundle = (n) => readFileSync(resolve(root, 'appserver/static/js/classic', n + '.min.js'), 'utf8');
const ORIGIN = 'http://adb.test';
const browser = await launch();
let pass = 0; const ok = (m) => { pass++; console.log('  ok  ', m); };

async function open(name, state, theme) {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), page = await ctx.newPage(), errors = [];
	page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.route(ORIGIN + '/**', (r) => r.fulfill(r.request().url().endsWith('.js') ? { contentType: 'text/javascript', body: bundle(name) } : { contentType: 'text/html', body: '<!doctype html><body style="margin:0"><div id="f" style="height:780px"></div>' }));
	await page.goto(ORIGIN + '/');
	await page.evaluate(({ src, state, theme }) => {
		window.__drills = []; window.__ready = false;
		const f = document.createElement('iframe'); f.style.cssText = 'width:100%;height:100%;border:0';
		f.srcdoc = '<!doctype html><html><body style="margin:0"><div id="root"></div><script src="' + src + '"></script></body></html>';
		window.addEventListener('message', (e) => { if (e.source !== f.contentWindow) return; if (e.data.adb === 'ready') { window.__ready = true; f.contentWindow.postMessage(Object.assign({ adb: 'state', theme }, state), window.location.origin); } else if (e.data.adb === 'drill') window.__drills.push(e.data.payload); });
		document.getElementById('f').appendChild(f);
	}, { src: ORIGIN + '/' + name + '.min.js', state, theme });
	await page.waitForFunction(() => window.__ready); await page.waitForTimeout(300);
	const frame = page.frames().find((x) => x !== page.mainFrame());
	return { page, frame, errors, ctx, drills: () => page.evaluate(() => window.__drills) };
}

for (const theme of ['light', 'dark']) {
	const v = await open('adb_heatmap', { dataSources: { primary: { data: sampleMatrix() } }, loading: false, options: { allLabel: 'All assets' } }, theme);
	assert.equal(await v.frame.locator('.adb').getAttribute('data-theme'), theme);
	assert.equal(await v.frame.locator('.rowlbl').count(), 7);
	if (theme === 'light') {
		await v.frame.locator('.cell[data-r="3"][data-k="1"]').click();
		assert.deepEqual(await v.drills(), [{ name: 'EDR', value: '64', 'row.os.value': 'Linux' }]);
		ok('heatmap (classic): renders from postMessage and a click is sent to the page');
	} else ok('heatmap (classic): dark theme');
	assert.deepEqual(v.errors, []); await v.ctx.close();
}
{
	const a = sampleAssets();
	const v = await open('adb_asset_explorer', { dataSources: { primary: { data: a.primary }, provenance: { data: a.provenance } }, loading: false }, 'dark');
	assert.ok(await v.frame.locator('.item').count() > 5, 'asset list renders');
	const sels = (await v.drills()).filter((d) => d['click.sel']);
	assert.ok(sels.length >= 1, 'the first asset is selected and reported');
	ok('explorer (classic): renders from postMessage and reports its selection');
	// the page says when the sources of the selected asset are being fetched: skeleton while they are, rows when they are in, never a false note
	const ids = await v.frame.locator('.item').evaluateAll((els) => els.map((e) => e.dataset.id));
	const send = (provenance, loading) => v.page.evaluate(([prov, l]) => document.querySelector('iframe').contentWindow.postMessage({ adb: 'state', dataSources: Object.assign({ primary: { data: window.__primary } }, prov ? { provenance: { data: prov, loading: l } } : {}), loading: false }, window.location.origin), [provenance, loading]);
	await v.page.evaluate((p) => { window.__primary = p; }, a.primary);
	await v.frame.locator(`.item[data-id="${ids.find((x) => x !== 'key0' && x !== ids[0])}"]`).click();
	assert.equal(await v.frame.locator('.note').count(), 0, 'no note in the first moment after the click either');
	await send(a.provenance, true);
	assert.ok(await v.frame.locator('.from .skel').count() > 0, 'skeleton while the sources are fetched'); assert.equal(await v.frame.locator('.note').count(), 0, 'no note while fetching');
	await send({ fields: a.provenance.fields, columns: a.provenance.columns.map(() => []) }, false);
	assert.equal(await v.frame.locator('.from .skel').count(), 0, 'the skeleton goes when the answer is in'); assert.match(await v.frame.locator('.note').innerText(), /not available/);
	ok('explorer (classic): skeleton while the sources load, the note only for a finished empty answer');
	assert.deepEqual(v.errors, []); await v.ctx.close();
}
for (const [name, sel] of [['adb_heatmap', '.sk-cell'], ['adb_asset_explorer', '.sk-item']]) {   // before any data: a skeleton, not "Loading…"
	const v = await open(name, { dataSources: {}, loading: true, options: {} }, 'light');
	assert.ok(await v.frame.locator(sel).count() > 3, `${name}: skeleton while loading`); assert.equal(await v.frame.locator('.msg').count(), 0);
	pass++; console.log('  ok  ', `${name} (classic): skeleton while the first data loads`);
	assert.deepEqual(v.errors, []); await v.ctx.close();
}
await browser.close(); console.log(`${pass} classic checks passed`);
