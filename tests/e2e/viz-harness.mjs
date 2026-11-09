// Runs a built custom visualization in a browser with a mock of the Dashboard Studio extension API, so it can be
// checked without Splunk. The mock feeds the same shapes Splunk does: { fields: [{name}], columns: [[...]] } per
// data source, theme { theme }, and records every triggerDrilldown call.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const bundle = (name) => readFileSync(resolve(root, 'appserver', 'static', 'visualizations', name, 'visualization.js'), 'utf8');

/** Launch Chromium; if the installed Playwright wants a browser that is not downloaded, use the newest cached headless shell. */
export async function launch() {
	try { return await chromium.launch(); } catch (err) {
		const base = resolve(homedir(), 'Library/Caches/ms-playwright'), cache = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
		for (const d of cache) {
			const dir = resolve(base, d); for (const sub of readdirSync(dir)) for (const exe of ['chrome-headless-shell', 'headless_shell']) { const p = resolve(dir, sub, exe); if (existsSync(p)) return chromium.launch({ executablePath: p }); }
		}
		throw err;
	}
}

/** Opens the visualization. `sources` maps a data source name to { fields, columns }. Returns { page, events, browser, push }. */
export async function openViz({ name, sources, theme = 'light', options = {}, width = 1200, height = 900, browser }) {
	const own = !browser; browser = browser || await launch();
	const ctx = await browser.newContext({ viewport: { width, height } });
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
	await page.evaluate(({ sources, theme, options }) => {
		const L = { ds: [], theme: [], opt: [] }; window.__events = [];
		const state = () => ({ dataSources: Object.fromEntries(Object.entries(window.__sources).map(([k, v]) => [k, { data: v }])), loading: false });
		window.__sources = sources;
		window.__push = (name, data) => { window.__sources[name] = data; L.ds.forEach((cb) => cb(state())); };
		window.DashboardExtensionAPI = {
			addDataSourcesListener: (cb, o) => { L.ds.push(cb); if (o && o.invokeImmediately) cb(state()); return () => {}; }, getDataSources: state,
			addOptionsListener: (cb, o) => { if (o && o.invokeImmediately) cb({ options }); return () => {}; }, getOptions: () => ({ options }), setOptions: () => {},
			addThemeListener: (cb, o) => { if (o && o.invokeImmediately) cb({ theme }); return () => {}; }, getTheme: () => ({ theme }),
			addDimensionsListener: (cb, o) => { if (o && o.invokeImmediately) cb({ width: innerWidth, height: innerHeight }); return () => {}; }, getDimensions: () => ({ width: innerWidth, height: innerHeight }),
			addModeListener: (cb, o) => { if (o && o.invokeImmediately) cb({ mode: 'view' }); return () => {}; }, getMode: () => ({ mode: 'view' }),
			addTokensListener: () => () => {}, getTokens: () => ({ tokens: {} }), addErrorListener: () => () => {}, getError: () => ({ error: '' }), setError: () => {}, clearError: () => {},
			addDrilldownListener: () => {}, triggerDrilldown: (a) => { window.__events.push(a); },
		};
	}, { sources, theme, options });
	await page.addScriptTag({ type: 'module', content: bundle(name) });
	await page.waitForTimeout(250);
	return { page, errors, browser, ctx, own, events: () => page.evaluate(() => window.__events), push: (n, d) => page.evaluate(([n2, d2]) => window.__push(n2, d2), [n, d]), close: async () => { await ctx.close(); if (own) await browser.close(); } };
}

// ---- sample data in the shapes Splunk returns -----------------------------------------------------------------------
let seed = 7; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
export const SOURCES = ['Active Directory', 'Cloud inventory', 'CMDB', 'DHCP', 'DNS', 'EDR', 'IPAM', 'MDM', 'NAC', 'Patch manager', 'SIEM', 'Vuln scanner'];
const POOL = { owner: ['Nancy Doe', 'Fred Goldman', 'Marge Wyatt', 'John Smith'], priority: ['low', 'medium', 'high'], bunit: ['accounting', 'cyber', 'hr', 'it'], category: ['server', 'desktop', 'mobile', 'web_app'], os: ['Windows Server', 'Windows Desktop', 'Linux', 'Mac', 'iOS', 'Android'], city: ['Berlin', 'Oslo', 'Tokyo'] };

/** n assets in the explorer's shape, plus per-source provenance rows for the first asset. */
export function sampleAssets(n = 100, total = 1211, nowSec = Math.floor(Date.now() / 1000)) {
	const names = ['adb_id', 'asset', 'source', 'conflicts', 'last_seen', 'adb_icon', 'adb_total', ...Object.keys(POOL)]; const cols = names.map(() => []);
	const merged = [];
	for (let i = 0; i < n; i++) {
		const os = pick(POOL.os), host = `${pick(POOL.city).toLowerCase()}-${os.toLowerCase().replace(/\s+/g, '-')}-${10 + i}`;
		const keys = [`00:00:00:00:${(i % 256).toString(16).padStart(2, '0')}:aa`, `10.${i % 8}.${i % 200}.${i % 250 + 2}`, host, `${host}.corp.example.com`];
		const srcs = SOURCES.filter(() => rnd() > .7); if (!srcs.length) srcs.push('CMDB');
		const vals = { owner: pick(POOL.owner), priority: pick(POOL.priority), bunit: pick(POOL.bunit), category: [pick(POOL.category), pick(POOL.category)], os, city: i % 5 ? pick(POOL.city) : '' };
		const row = [`key${i}`, keys, srcs, i % 3 === 0 ? ['owner'] : [], String(nowSec - (i % 40) * 86400 - 3600), os.includes('Server') || os === 'Linux' ? 'server' : /iOS|Android/.test(os) ? 'mobile' : 'desktop', String(total), vals.owner, vals.priority, vals.bunit, [...new Set(vals.category)], vals.os, vals.city];
		row.forEach((v, c) => cols[c].push(v)); merged.push({ id: `key${i}`, vals, srcs });
	}
	const a0 = merged[0], prov = [];
	['owner', 'priority', 'os'].forEach((f) => a0.srcs.forEach((s, k) => prov.push([s, f, k === 1 ? 'Someone Else' : a0.vals[f], String(nowSec - (k + 1) * 5 * 86400)])));
	return { primary: { fields: names.map((name) => ({ name })), columns: cols }, provenance: { fields: ['source', 'field', 'value', 'seen', 'adb_key'].map((name) => ({ name })), columns: [0, 1, 2, 3].map((c) => prov.map((r) => r[c])).concat([prov.map(() => 'key0')]) }, first: merged[0] };
}

/** A coverage matrix: rows are groups, columns are sources, with row sizes. */
export function sampleMatrix() {
	const groups = [['Windows Server', 312, [96, 93, 98, 41, 88, 0, 72]], ['Windows Desktop', 1840, [82, 91, 95, 77, 54, 12, 80]], ['Linux', 927, [89, 64, 6, 58, 81, 0, 69]], ['Mac', 421, [71, 38, 3, 66, 22, 92, 61]], ['iOS', 688, [35, 5, 0, 74, 0, 97, 33]], ['Android', 539, [31, 2, 0, 70, 0, 88, 29]]];
	const src = ['CMDB', 'EDR', 'Active Directory', 'DHCP', 'Vuln scanner', 'MDM', 'DNS'];
	const fields = [{ name: 'os' }, ...src.map((name) => ({ name })), { name: 'adb_total' }];
	const columns = [groups.map((g) => g[0]), ...src.map((_, k) => groups.map((g) => String(g[2][k]))), groups.map((g) => String(g[1]))];
	return { fields, columns };
}
