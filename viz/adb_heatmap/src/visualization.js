import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import '../../shared/theme.css';
import './visualization.css';
import { parseMatrix, allRow, columnAverages, sortRows } from '../../shared/matrix.mjs';
import { ramp, rgbCss, ink, MAGMA } from '../../shared/ramp.mjs';
import { lookupMap, sourceIcon } from '../../shared/source-icons.mjs';

// Coverage heatmap. Column 1 labels the rows, every other column is a series of 0-100 values. See matrix.mjs for the
// optional adb_total and <series>__n columns. Nothing here names a field: any number of series works.

const root = document.getElementById('root') || document.body;
const host = document.createElement('div');
host.className = 'adb hm';
root.appendChild(host);

const state = { lookups: {}, model: null, loading: false, options: {}, theme: 'light', metric: 'pct', sort: { key: null, dir: 1 }, lo: 0, hi: 100, sel: null, focus: [0, 0] };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const allLabel = () => String((state.options && state.options.allLabel) || 'All assets');

function listRows() {
	const m = state.model, top = m.rows.length > 1 ? allRow(m, allLabel()) : null;   // with one row the pinned row would only repeat it
	return (top ? [top] : []).concat(sortRows(m.rows, state.sort));
}
function cellValue(row, k) { return state.metric === 'count' ? row.counts[k] : row.values[k]; }

function render() {
	host.setAttribute('data-theme', state.theme);
	host.textContent = '';
	if (state.loading && !state.model) {   // the grid, drawn as gray cells, while the first data is on its way
		const g = el('div', 'sk-grid'); g.setAttribute('aria-busy', 'true'); g.setAttribute('aria-label', 'Loading coverage');
		for (let r = 0; r < 7; r++) { g.appendChild(el('i', 'sk sk-label')); for (let c = 0; c < 8; c++) g.appendChild(el('i', 'sk sk-cell')); }
		host.appendChild(g); return;
	}
	const m = state.model;
	if (!m) { host.appendChild(el('div', 'msg', 'No data')); return; }
	if (!m.series.length) { host.appendChild(el('div', 'msg', 'The search needs a label column followed by one numeric column per source.')); return; }
	if (!m.hasCounts) state.metric = 'pct';

	// toolbar: metric switch (only when counts exist) and the legend / brush
	const bar = el('div', 'bar');
	if (m.hasCounts) {
		const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Value shown');
		[['pct', 'Percent'], ['count', 'Assets']].forEach(([k, label]) => {
			const b = el('button', '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(state.metric === k));
			b.addEventListener('click', () => { state.metric = k; render(); }); seg.appendChild(b);
		});
		bar.appendChild(seg);
	}
	bar.appendChild(el('span', 'sp'));
	bar.appendChild(buildLegend());
	host.appendChild(bar);

	const scroll = el('div', 'scroll'), grid = el('div', 'grid'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', 'Coverage by ' + m.rowField);
	grid.style.gridTemplateColumns = `minmax(190px, 230px) repeat(${m.series.length}, minmax(92px, 1fr))`;
	const arrow = (k) => (state.sort.key === k ? el('span', 'sort', state.sort.dir > 0 ? '▲' : '▼') : null);
	const avg = columnAverages(m);

	const h0 = el('div', 'hdr first'); const n0 = el('span', 'nm'); n0.appendChild(el('span', '', m.rowField)); if (arrow('name')) n0.appendChild(arrow('name')); h0.appendChild(n0);
	h0.title = 'Sort by name or size'; h0.addEventListener('click', () => { const s = state.sort; state.sort = s.key === 'name' && s.dir === 1 ? { key: 'name', dir: -1 } : s.key === 'name' ? { key: 'size', dir: -1 } : s.key === 'size' ? { key: null, dir: 1 } : { key: 'name', dir: 1 }; render(); });
	grid.appendChild(h0);
	m.series.forEach((s, k) => {
		const h = el('div', 'hdr'), nm = el('span', 'nm'); const ic = el('span', 'src'); ic.innerHTML = sourceIcon(s.name, state.lookups, state.theme, 16); nm.appendChild(ic); nm.appendChild(el('span', '', s.name)); if (arrow(k)) nm.appendChild(arrow(k)); h.appendChild(nm);
		h.appendChild(el('span', 'avg', isNaN(avg[k]) ? '' : `avg ${avg[k]}%`)); h.dataset.col = k; h.title = `Sort rows by ${s.name}`;
		h.addEventListener('click', () => { const sk = state.sort; state.sort = sk.key === k ? (sk.dir === -1 ? { key: k, dir: 1 } : { key: null, dir: 1 }) : { key: k, dir: -1 }; render(); });
		grid.appendChild(h);
	});

	const rows = listRows(), maxSize = Math.max(1, ...m.rows.map((r) => r.total || 0));
	rows.forEach((r, i) => {
		const lbl = el('div', 'rowlbl' + (r.pinned ? ' pinned-top' : '')); lbl.dataset.row = i;
		lbl.appendChild(el('span', 'nm', r.label)); lbl.lastChild.title = r.label;
		if (r.total !== null) { const n = el('span', 'n', `${r.total.toLocaleString()} assets`); if (!r.pinned) { const sh = el('span', 'share'), b = document.createElement('i'); b.style.width = Math.max(4, r.total / maxSize * 100) + '%'; sh.appendChild(b); n.appendChild(sh); } lbl.appendChild(n); }
		grid.appendChild(lbl);
		m.series.forEach((s, k) => {
			const pad = el('div', 'pad' + (r.pinned ? ' pinned-top' : '')), v = r.values[k], cell = el('div', 'cell');
			cell.dataset.r = i; cell.dataset.k = k; cell.setAttribute('role', 'gridcell');
			if (isNaN(v)) { cell.classList.add('empty'); cell.textContent = '—'; cell.tabIndex = -1; }
			else {
				const c = ramp(v / 100); cell.style.background = rgbCss(c); cell.style.color = ink(c);
				const shown = cellValue(r, k); cell.textContent = state.metric === 'count' ? (isNaN(shown) ? '—' : shown.toLocaleString()) : v + '%';
				cell.tabIndex = i === state.focus[0] && k === state.focus[1] ? 0 : -1;
				cell.setAttribute('aria-label', `${r.label}, ${s.name}: ${v}% covered` + (isNaN(r.counts[k]) || r.total === null ? '' : `, ${r.counts[k]} of ${r.total} assets`));
				if (v < state.lo || v > state.hi) cell.classList.add('dim');
				if (state.sel && state.sel.r === r.label && state.sel.k === k) cell.classList.add('sel');
				cell.addEventListener('click', () => drill(r, k, cell));
				cell.addEventListener('mouseenter', () => hover(cell, r, k, avg));
				cell.addEventListener('mouseleave', () => unhover());
			}
			pad.appendChild(cell); grid.appendChild(pad);
		});
	});
	scroll.appendChild(grid); host.appendChild(scroll);
	const tip = el('div', 'tip'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); host.appendChild(tip);
	grid.addEventListener('keydown', onKey);
}

function buildLegend() {
	const wrap = el('div', 'legend'), w = el('div', 'legend-wrap');
	const bar = el('div', 'legend-bar'); bar.style.background = `linear-gradient(to right, ${MAGMA.join(',')})`;
	const dl = el('div', 'legend-dim'), dr = el('div', 'legend-dim'); dl.style.left = '0'; dl.style.width = state.lo + '%'; dr.style.right = '0'; dr.style.width = (100 - state.hi) + '%';
	const mk = (id, val, label, fn) => { const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = val; i.setAttribute('aria-label', label); i.addEventListener('input', () => { fn(+i.value); i.value = id === 'lo' ? state.lo : state.hi; dl.style.width = state.lo + '%'; dr.style.width = (100 - state.hi) + '%'; applyDim(); }); return i; };
	const ticks = el('div', 'legend-ticks'); [0, 25, 50, 75, 100].forEach((t) => { const s = el('span', '', t + '%'); s.style.left = t + '%'; ticks.appendChild(s); });
	w.append(bar, dl, dr, mk('lo', state.lo, 'Lowest coverage shown', (v) => { state.lo = Math.min(v, state.hi); }), mk('hi', state.hi, 'Highest coverage shown', (v) => { state.hi = Math.max(v, state.lo); }), ticks);
	wrap.appendChild(w); return wrap;
}
function applyDim() {
	const rows = listRows();
	host.querySelectorAll('.cell[data-r]').forEach((c) => { const v = rows[+c.dataset.r].values[+c.dataset.k]; if (!isNaN(v)) c.classList.toggle('dim', v < state.lo || v > state.hi); });
}

// The host forwards `name`, `value` and keys that start with `row.` or `click.`; a dashboard handler turns them into tokens.
function drill(r, k, cell) {
	const m = state.model; state.sel = { r: r.label, k };
	host.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); cell.classList.add('sel');
	const payload = { name: m.series[k].name, value: String(r.values[k]) }; payload['row.' + m.rowField + '.value'] = r.label;
	VisualizationAPI.triggerDrilldown({ action: 'custom.click', payload });
}

function hover(cell, r, k, avg) {
	const m = state.model, tip = host.querySelector('#tip'), v = r.values[k], cnt = r.counts[k], have = r.total !== null && !isNaN(cnt);
	const rowAvg = Math.round(r.values.filter((x) => !isNaN(x)).reduce((a, b) => a + b, 0) / Math.max(1, r.values.filter((x) => !isNaN(x)).length));
	const dl = [`<dt>Row average</dt><dd>${rowAvg}%</dd>`, `<dt>${m.series[k].name} overall</dt><dd>${isNaN(avg[k]) ? '—' : avg[k] + '%'}</dd>`];
	if (have) dl.unshift(`<dt>Not covered</dt><dd>${(r.total - cnt).toLocaleString()} assets</dd>`);
	const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	tip.innerHTML = `<div class="t"><b>${esc(r.label)}</b> × ${esc(m.series[k].name)}</div><div class="v">${v}%${have ? ` <small>${cnt.toLocaleString()} of ${r.total.toLocaleString()} assets</small>` : ''}</div><div class="meter"><i style="width:${v}%;background:${rgbCss(ramp(v / 100))}"></i></div><dl>${dl.join('')}</dl><div class="hint">Click to list these assets</div>`;
	const b = cell.getBoundingClientRect(), tw = 230, th = tip.offsetHeight || 170; let x = b.right + 8, y = b.top - 6;
	if (x + tw > innerWidth - 4) x = b.left - tw - 8; if (x < 4) x = Math.max(4, (innerWidth - tw) / 2);   // stay inside the iframe
	if (y + th > innerHeight - 4) y = innerHeight - th - 4; if (y < 4) y = 4;
	tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on');
	host.querySelectorAll('.hl').forEach((x2) => x2.classList.remove('hl'));
	host.querySelectorAll(`.rowlbl[data-row="${cell.dataset.r}"]`).forEach((x2) => x2.classList.add('hl'));
	const hs = host.querySelectorAll('.hdr:not(.first)'); if (hs[k]) hs[k].classList.add('hl');
}
function unhover() { const t = host.querySelector('#tip'); if (t) t.classList.remove('on'); host.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl')); }

function onKey(e) {
	const c = e.target.closest('.cell'); if (!c) return; let r = +c.dataset.r, k = +c.dataset.k; const rows = listRows(), maxK = state.model.series.length - 1;
	if (e.key === 'ArrowRight') k = Math.min(maxK, k + 1); else if (e.key === 'ArrowLeft') k = Math.max(0, k - 1); else if (e.key === 'ArrowDown') r = Math.min(rows.length - 1, r + 1); else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
	else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); return; } else return;
	e.preventDefault(); const n = host.querySelector(`.cell[data-r="${r}"][data-k="${k}"]`); if (n && !n.classList.contains('empty')) { c.tabIndex = -1; n.tabIndex = 0; n.focus(); state.focus = [r, k]; }
}

VisualizationAPI.addDataSourcesListener(({ dataSources, loading }) => {
	state.loading = !!loading;
	const d = dataSources && dataSources.primary && dataSources.primary.data;
	const sr = dataSources && dataSources.sources && dataSources.sources.data; if (sr) state.lookups = lookupMap(sr);
	if (d) state.model = parseMatrix(d); else if (!loading) state.model = null;
	render();
}, { invokeImmediately: true });
VisualizationAPI.addOptionsListener(({ options }) => { state.options = options || {}; render(); }, { invokeImmediately: true });
VisualizationAPI.addThemeListener((t) => { const n = t && (typeof t.theme === 'string' ? t.theme : t.theme && t.theme.name) || 'light'; state.theme = /dark/i.test(String(n)) ? 'dark' : 'light'; render(); }, { invokeImmediately: true });
