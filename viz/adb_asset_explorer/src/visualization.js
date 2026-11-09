import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import '../../shared/theme.css';
import './visualization.css';
import { esc, shape, agoText, freshness, dateText, wildcardRegex, asList } from '../../shared/util.mjs';
import { parseAssets, filterAssets, sortAssets } from '../../shared/assets.mjs';
import { buildProvenance } from '../../shared/provenance.mjs';
import { sourceOrder, sourceColor } from '../../shared/palette.mjs';
import { iconSvg } from '../../shared/icons.mjs';
import { lookupMap, sourceIcon, hasVendorIcon } from '../../shared/source-icons.mjs';

// Asset explorer: a searchable list of assets and, for the selected one, its fields and where each value came from.
// Data: primary = the matching assets (see assets.mjs); optional `provenance` = per-source rows for the selected asset
// (columns source, field, value, seen). The search box and the selection are sent to the dashboard as tokens
// through the drilldown event, so the dashboard search can narrow and fetch the provenance.

const PROV_MV = '~|~';       // what adb_provenance puts between the values of a multivalue field
const MAX_FROM = 4;          // sources listed on a field before the rest become "+N more"
const SEARCH_DELAY = 450;    // ms after typing before the dashboard search is asked to run again
const root = document.getElementById('root') || document.body;
const host = document.createElement('div'); host.className = 'adb'; root.appendChild(host);

const S = { lookups: {}, model: { assets: [], total: 0, fieldNames: [] }, provRows: [], provLoaded: false, provWait: false, provSeen: false, loading: false, theme: 'light', q: '', sort: 'seen', sel: null, searching: false,
	diffOnly: false, showEmpty: false, open: new Set(), moreOpen: new Set(), fromOpen: new Set(), keysOpen: false, lastEmit: '', committedQ: '' };
let shell = null, searchTimer = null, searchGuard = null, provTimer = null;
const PROV_WAIT_MAX = 6000;   // ms to wait for the sources of a newly selected asset before saying they are not there

// ---- events to the dashboard -------------------------------------------------------------------------------------
// Every event carries both values so that a dashboard handler can set both tokens each time. The query sent is the
// committed one (after the typing pause), never the half-typed text, so the dashboard search is not re-run per keystroke.
function emit(reason) {
	const sig = JSON.stringify([S.sel, S.committedQ]);
	if (sig === S.lastEmit) return;
	S.lastEmit = sig;
	VisualizationAPI.triggerDrilldown({ action: 'custom.click', payload: { 'click.sel': S.sel || '', 'click.q': S.committedQ || '', name: reason, value: reason === 'search' ? S.committedQ : (S.sel || '') } });
}
// The sources of the selected asset come from a search that starts after the selection. Until its answer is in, the field rows show
// a skeleton: the previous asset's answer (or an empty one) must not be read as "no sources". The page says when that search runs
// (dataSources.provenance.loading); a host that does not (Dashboard Studio) is covered by the timeout.
function waitForProvenance() {
	S.provWait = true; S.provSeen = false;
	clearTimeout(provTimer); provTimer = setTimeout(() => { S.provWait = false; if (selected()) renderDetail(); }, PROV_WAIT_MAX);
}
function provenanceArrived(running) {
	if (!S.provWait) return;
	const a = selected();
	if (running) S.provSeen = true;
	const mine = a && S.provRows.some((r) => r.key && r.key === a.id);
	if (mine || (S.provSeen && !running)) { S.provWait = false; clearTimeout(provTimer); }
}
function commitQuery() { S.committedQ = S.q; emit('search'); }

// ---- derived state -------------------------------------------------------------------------------------------------
function visible() { return sortAssets(filterAssets(S.model.assets, S.q), S.sort); }
function selected() { return S.model.assets.find((a) => a.id === S.sel) || null; }
function allSources() {
	const n = new Set(); S.model.assets.forEach((a) => a.sources.forEach((s) => n.add(s))); S.provRows.forEach((r) => n.add(r.source));
	return sourceOrder(Array.from(n));
}
function provFor(a) {
	// rows stamped with another asset arrived after the selection moved on: ignore them
	const rows = a ? S.provRows.filter((r) => !r.key || r.key === a.id) : [];
	if (!rows.length) return null;
	return buildProvenance(rows, a.fields);
}
// Every asset has an icon: the one adb_icon sets, or the default ("other") when it sets nothing or something that is not an icon.
const tile = (a, big) => `<span class="tile${big ? ' lg' : ''}" aria-hidden="true">${iconSvg(a.icon)}</span>`;
const hl = (text, re) => { if (!re) return esc(text); const m = re.exec(text); if (!m || !m[0]) return esc(text); return esc(text.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>' + esc(text.slice(m.index + m[0].length)); };

// ---- rendering -----------------------------------------------------------------------------------------------------
// What the page looks like while the first assets are on their way: the list and the detail, drawn as gray bars.
function skeletonHtml() {
	const item = (w) => `<div class="sk-item"><i class="sk sk-tile"></i><span><i class="sk" style="width:${w}%;height:12px"></i><i class="sk" style="width:${w - 18}%;height:10px;margin-top:7px"></i></span></div>`;
	const row = (a, b) => `<div class="sk-row"><i class="sk" style="width:${a}%;height:11px"></i><i class="sk" style="width:${b}%;height:13px"></i></div>`;
	return `<div class="xp" style="height:100%" aria-busy="true" aria-label="Loading assets"><div class="pane-l"><div class="search"><i class="sk" style="height:34px"></i></div><div class="sk-list">${[78, 62, 70, 55, 74, 60, 68, 52].map(item).join('')}</div></div>
		<div class="pane-r"><div class="dhead"><div class="sk-hero"><i class="sk sk-tile lg"></i><span><i class="sk" style="width:240px;height:20px"></i><i class="sk" style="width:180px;height:11px;margin-top:9px"></i></span></div></div><div class="sk-detail">${[[18, 30], [14, 52], [20, 24], [12, 44], [16, 36], [22, 48]].map(([a, b]) => row(a, b)).join('')}</div></div></div>`;
}
function build() {
	host.textContent = '';
	shell = document.createElement('div'); shell.className = 'xp'; shell.style.height = '100%';
	shell.innerHTML = `<div class="pane-l"><div class="search"><label class="sbox"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.6 10.6L14 14"/></svg><input data-q type="text" placeholder="Search key values — * matches anything" autocomplete="off" spellcheck="false" aria-label="Search key values"><button class="iconbtn" data-clear type="button" title="Clear (Esc)" hidden>✕</button></label></div>
		<div class="meta"><span data-count></span><select data-sort aria-label="Sort assets"><option value="seen">Last seen</option><option value="name">Name A–Z</option><option value="sources">Most sources</option></select></div>
		<div class="list" data-list role="listbox" tabindex="0" aria-label="Assets"></div></div><div class="pane-r" data-detail></div><div class="toast" data-toast role="status"></div>`;
	host.appendChild(shell);
	const q = shell.querySelector('[data-q]'), sort = shell.querySelector('[data-sort]');
	q.value = S.q; sort.value = S.sort;
	q.addEventListener('input', () => {
		S.q = q.value; S.searching = true; renderList(); ensureSelection();
		clearTimeout(searchTimer); searchTimer = setTimeout(commitQuery, SEARCH_DELAY);
		clearTimeout(searchGuard); searchGuard = setTimeout(() => { S.searching = false; renderList(); }, 8000);   // never stay on "Searching…"
	});
	shell.querySelector('[data-clear]').addEventListener('click', () => { S.q = ''; q.value = ''; S.searching = true; renderList(); ensureSelection(); clearTimeout(searchTimer); commitQuery(); q.focus(); });
	sort.addEventListener('change', () => { S.sort = sort.value; renderList(); });
	shell.querySelector('[data-list]').addEventListener('click', (e) => { const it = e.target.closest('.item'); if (it) select(it.dataset.id); });
	shell.querySelector('[data-detail]').addEventListener('click', onDetailClick);
	shell.addEventListener('keydown', onKey);
}
function setClass() { shell.classList.add('tiles'); }

function renderList() {
	if (!shell) return;
	const rows = visible(), re = wildcardRegex(S.q), total = S.model.total;
	const capped = total > S.model.assets.length;
	shell.querySelector('[data-count]').innerHTML = S.searching ? 'Searching…' : `<b>${rows.length.toLocaleString()}</b> of ${Math.max(total, rows.length).toLocaleString()} ${S.q ? 'matches' : 'assets'}`;
	shell.querySelector('[data-clear]').hidden = !S.q;
	const list = shell.querySelector('[data-list]');
	if (!rows.length) { list.innerHTML = `<div class="empty"><b>${S.searching ? 'Searching…' : 'No assets match'}</b>${S.searching ? '' : 'Check the spelling, or use * as a wildcard, for example <span class="mono">10.4.*</span>.'}</div>`; return; }
	list.innerHTML = rows.map((a) => {
		const matched = re ? a.keys.find((k) => re.test(k)) : null;
		const line2 = matched && !re.test(a.label) ? `matched <span class="mono">${hl(matched, re)}</span>` : `<span class="mono">${esc(a.ids)}</span>`;
		return `<div class="item" role="option" data-id="${esc(a.id)}" aria-selected="${a.id === S.sel}">${tile(a)}<div class="l1"><span class="nm">${hl(a.label, re)}</span><span class="seen">${esc(agoText(a.days))}</span></div><div class="ids">${line2}</div></div>`;
	}).join('') + (capped && !S.searching ? `<div class="capnote">Showing the first ${S.model.assets.length.toLocaleString()} of ${total.toLocaleString()}${S.q ? '' : ', most recently seen'}. Refine the search to narrow it down.</div>` : '');
	setClass();
}

function renderDetail() {
	if (!shell) return;
	const d = shell.querySelector('[data-detail]'), a = selected();
	if (!a) { d.innerHTML = `<div class="empty"><b>Select an asset</b>Its fields, and where each value came from, appear here.</div>`; return; }
	const keys = S.keysOpen ? a.keys : a.keys.slice(0, 4);
	const keyHtml = keys.map((v) => `<span class="key mono" data-copy="${esc(v)}" title="${shape(v)} · click to copy">${esc(v)}</span>`).join('') + (a.keys.length > 4 && !S.keysOpen ? `<button class="more mono" type="button" data-keys>+${a.keys.length - 4} more</button>` : '');
	const provA = provFor(a), fieldDiffs = diffFields(provA).length;
	const filled = S.model.fieldNames.filter((n) => a.fields[n] && a.fields[n].length).length;
	const nAll = allSources().length, nSrc = a.sources.length;
	const srcText = nAll > 1 ? `${nSrc} of ${nAll} sources` : `${nSrc} source${nSrc === 1 ? '' : 's'}`;
	const f = freshness(a.days);
	d.innerHTML = `<div class="dhead"><div class="hero">${tile(a, true)}<div><h3>${esc(a.label)}</h3><div class="sub">${a.days === null ? '' : `<span class="stat ${f}"><i></i>${f === 'stale' ? 'Not seen since ' + agoText(a.days) : 'Seen ' + agoText(a.days)}</span><span>·</span>`}<span>${srcText}</span>${fieldDiffs ? `<span>·</span><button class="linkbtn" type="button" data-diff aria-pressed="${S.diffOnly}">${fieldDiffs} field${fieldDiffs > 1 ? 's' : ''} differ</button>` : ''}</div></div></div><div class="keys">${keyHtml}</div></div>
		<div class="fhead">Fields <span class="ct">${filled} with a value</span></div>${S.provLoaded && !S.loading && !S.provWait && !S.provRows.some((r) => !r.key || r.key === a.id) ? `<div class="note">Which source supplied each value is not available for this asset. The sources are read again from their lookups, so check that they can be read and that no source filter excludes this asset's rows (Configure &gt; Sources).</div>` : ''}<div class="body">${fieldsHtml(a)}</div>`;
}

// A source is a badge tinted with the source's color; its name is always written out.
// A source with a vendor logo gets the standard badge color, so that no tint clashes with the logo; only a source without one is tinted with its own color.
const badge = (name, order, cls, title, tail) => { const logo = hasVendorIcon(name, S.lookups); return `<span class="badge${logo ? ' ic' : ''}${cls || ''}"${logo ? '' : ` style="--c:${sourceColor(name, order)}"`}${title ? ` title="${esc(title)}"` : ''}>${sourceIcon(name, S.lookups, S.theme, 14)}${esc(name)}${tail || ''}</span>`; };
function fromHtml(a, name, prov, key) {
	const order = allSources();
	if (!prov || !prov[name]) return S.provWait && (a.fields[name] || []).length ? '<span class="skel" aria-hidden="true"></span>' : '';
	const all = prov[name], open = S.fromOpen.has(key), shown = open ? all : all.slice(0, MAX_FROM);
	const one = (p) => badge(p.s, order, p.st === 'differ' ? ' d' : '', `${p.s}: ${p.v.join(', ')}`, p.st === 'differ' ? '<em>≠</em>' : '');
	return shown.map(one).join('') + (all.length > shown.length ? `<button class="more" type="button" data-from="${esc(key)}">+${all.length - shown.length} more</button>` : '');
}
function valueHtml(a, name) {
	const arr = a.fields[name] || [];
	if (!arr.length) return '<span class="fval none">—</span>';
	if (arr.length === 1) return `<span class="fval">${esc(arr[0])}</span>`;
	const key = a.id + name, open = S.moreOpen.has(key), shown = open ? arr : arr.slice(0, 3);
	return `<span class="vchips">${shown.map((x) => `<span class="vchip">${esc(x)}</span>`).join('')}${arr.length > 3 && !open ? `<button class="more" type="button" data-more="${esc(key)}">+${arr.length - 3}</button>` : ''}</span>`;
}
// The fields on which a source differs from the final value: the ones the list can show (the fields of the model), so that the count in the header and the list it opens agree.
const diffFields = (prov) => (prov ? S.model.fieldNames.filter((n) => prov[n] && prov[n].some((p) => p.st === 'differ')) : []);
function fieldsHtml(a) {
	const prov = provFor(a), order = allSources();
	const all = S.model.fieldNames.map((n) => ({ n, v: a.fields[n] || [] }));
	const hidden = all.filter((r) => !r.v.length).length;
	const dset = new Set(diffFields(prov));
	let rows = S.diffOnly ? all.filter((r) => dset.has(r.n)) : all.filter((r) => r.v.length || S.showEmpty);   // a field with no final value still shows when it is one that differs
	const html = rows.map((r) => {
		const key = a.id + r.n, ent = prov && prov[r.n], open = S.open.has(key) ? ' open' : '';
		const diff = ent && ent.some((p) => p.st === 'differ') ? ' hasdiff' : '';
		const detail = ent ? `<div class="fdetail"><table><thead><tr><th>Source</th><th>Value</th><th>Last seen</th><th></th></tr></thead><tbody>${ent.map((p) => `<tr><td>${badge(p.s, order)}</td><td>${esc(p.v.join(', '))}</td><td>${esc(dateText(p.seen))}</td><td class="${p.used ? 'st-used' : p.st === 'differ' ? 'st-diff' : 'st-agree'}">${p.used ? 'used (most recent)' : p.st === 'differ' ? 'differs' : 'agrees'}</td></tr>`).join('')}</tbody></table></div>` : '';
		return `<div class="frow${open}${diff}${ent ? ' has-prov' : ''}"><div class="fmain" ${ent ? `data-toggle="${esc(key)}"` : ''}><span class="fname">${esc(r.n)}</span>${valueHtml(a, r.n)}<span class="from">${fromHtml(a, r.n, prov, key)}</span><span class="caret">${ent ? '›' : ''}</span></div>${detail}</div>`;
	}).join('');
	const foot = hidden && !S.diffOnly ? `<div class="emptyfields"><button class="more" type="button" data-empty>${S.showEmpty ? 'Hide' : 'Show'} ${hidden} field${hidden > 1 ? 's' : ''} with no value</button></div>` : '';
	return html + foot;
}

// ---- interactions ----------------------------------------------------------------------------------------------------
function select(id) { if (id !== S.sel && S.provLoaded) waitForProvenance(); S.sel = id; S.keysOpen = false; S.diffOnly = false; shell.querySelectorAll('.item').forEach((e) => e.setAttribute('aria-selected', String(e.dataset.id === id))); renderDetail(); emit('select'); }
function ensureSelection() {
	const v = visible();
	if (v.length && !v.some((a) => a.id === S.sel)) select(v[0].id); else if (!v.length) renderDetail();
}
function onDetailClick(e) {
	const t = e.target;
	if (t.closest('[data-diff]')) { S.diffOnly = !S.diffOnly; renderDetail(); return; }
	if (t.closest('[data-keys]')) { S.keysOpen = true; renderDetail(); return; }
	if (t.closest('[data-empty]')) { S.showEmpty = !S.showEmpty; renderDetail(); return; }
	const more = t.closest('[data-more]'); if (more) { S.moreOpen.add(more.dataset.more); renderDetail(); return; }
	const fr = t.closest('[data-from]'); if (fr) { S.fromOpen.add(fr.dataset.from); renderDetail(); return; }
	const cp = t.closest('[data-copy]'); if (cp) { try { navigator.clipboard.writeText(cp.dataset.copy); } catch (err) { /* sandboxed iframes may block the clipboard */ } toast(`Copied ${cp.dataset.copy}`); return; }
	const row = t.closest('[data-toggle]'); if (row) { const k = row.dataset.toggle; S.open.has(k) ? S.open.delete(k) : S.open.add(k); row.parentElement.classList.toggle('open'); }
}
let toastTimer; function toast(m) { const t = shell.querySelector('[data-toast]'); t.textContent = m; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1400); }
function onKey(e) {
	const tag = document.activeElement && document.activeElement.tagName, inField = tag === 'INPUT' || tag === 'SELECT';
	if (e.key === '/' && !inField) { e.preventDefault(); shell.querySelector('[data-q]').focus(); return; }
	if (e.key === 'Escape' && S.q) { S.q = ''; shell.querySelector('[data-q]').value = ''; S.searching = true; renderList(); clearTimeout(searchTimer); commitQuery(); return; }
	if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (document.activeElement === shell.querySelector('[data-list]') || document.activeElement === shell.querySelector('[data-q]'))) {
		e.preventDefault(); const v = visible(), i = v.findIndex((a) => a.id === S.sel), n = v[Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
		if (n) { select(n.id); const el = shell.querySelector(`.item[data-id="${CSS.escape(n.id)}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
	}
}

// ---- host wiring -----------------------------------------------------------------------------------------------------
function refresh() { if (!shell) build(); host.setAttribute('data-theme', S.theme); renderList(); if (!selected()) { const v = visible(); if (v.length) { if (S.provLoaded) waitForProvenance(); S.sel = v[0].id; } } renderDetail(); if (selected()) emit('select'); }

VisualizationAPI.addDataSourcesListener(({ dataSources, loading }) => {
	S.loading = !!loading;
	const p = dataSources && dataSources.primary && dataSources.primary.data;
	const pr = dataSources && dataSources.provenance && dataSources.provenance.data;
	const provRunning = !!(dataSources && dataSources.provenance && dataSources.provenance.loading);
	const sr = dataSources && dataSources.sources && dataSources.sources.data; if (sr) S.lookups = lookupMap(sr);
	if (p) { S.model = parseAssets(p, Date.now()); S.searching = false; clearTimeout(searchGuard); }
	if (pr) {
		S.provLoaded = true;
		const idx = {}; pr.fields.forEach((f, i) => { idx[f.name] = i; });
		const n = pr.columns[0] ? pr.columns[0].length : 0; S.provRows = [];
		for (let r = 0; r < n; r++) S.provRows.push({ source: asList(pr.columns[idx.source][r])[0], field: asList(pr.columns[idx.field][r])[0], value: String(asList(pr.columns[idx.value][r])[0] || '').split(PROV_MV), seen: asList(pr.columns[idx.seen][r])[0], key: idx.adb_key === undefined ? '' : asList(pr.columns[idx.adb_key][r])[0] || '' });
	} else if (dataSources && 'provenance' in dataSources === false) { S.provRows = []; }
	provenanceArrived(provRunning);
	if (!p && loading && !shell) { host.innerHTML = skeletonHtml(); return; }
	if ((!p || !p.fields || !p.fields.length) && !S.model.assets.length && !loading) { host.textContent = ''; shell = null; host.appendChild(Object.assign(document.createElement('div'), { className: 'msg', textContent: 'No data' })); return; }
	if (shell && !host.contains(shell)) shell = null;
	const keep = S.sel; refresh(); if (keep && selected()) { /* selection survived the new data */ }
}, { invokeImmediately: true });
VisualizationAPI.addThemeListener((t) => { const n = t && (typeof t.theme === 'string' ? t.theme : t.theme && t.theme.name) || 'light'; S.theme = /dark/i.test(String(n)) ? 'dark' : 'light'; host.setAttribute('data-theme', S.theme); if (shell && selected()) renderDetail(); }, { invokeImmediately: true });
