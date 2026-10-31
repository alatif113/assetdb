/* AssetDB Configure: mockup. Draft-and-save editing, read-only tables, row actions, tooltips for help text.
   Static data, no network. All SPL and numbers are illustrative. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MERGE = ['latest', 'earliest', 'min', 'max', 'avg', 'sum', 'coalesce'];
const NORMS = ['default', 'none', 'hostname', 'mac', 'ip', 'lowercase', 'trim'];
const RESERVED = ['_key', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts'];
const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const TIPS = {
  name: 'Letters, digits and underscores, starting with a letter. Names that start with an underscore are internal to Splunk and are not allowed.',
  desc: 'A short note shown in the field list. It has no effect on the merge.',
  fenabled: 'A disabled field is left out of the merge but keeps its settings.',
  key: 'Records that share a value in a key field are merged into one asset, even across sources.',
  merge: 'How one value is picked when sources disagree. Latest takes the newest record, Coalesce takes the first non-empty value in source order, Min, Max, Avg and Sum work on numbers.',
  cs: 'When off, values are compared in lowercase, so WKS-01 and wks-01 are the same value. Leave on where case carries meaning.',
  norm: 'Tidies each value before matching, for example stripping the domain from a host name or formatting a MAC address.',
  ignore: 'Values treated as empty. Add exact values, re:pattern for a regular expression, or cidr:10.0.0.0/8 for a network.',
  inherit: 'Also ignore the values on the global ignore list in Settings.',
  validation: 'Values that do not match are dropped and counted in the run record.',
  vtype: 'Number converts values before merging, which Min, Max, Avg and Sum need.',
  maxvals: 'For multivalue fields: the most values kept per asset, newest first.',
  keepcase: 'Match in lowercase but store the value as it was written.',
  track: 'List this field under “conflicts” on an asset when sources disagree.',
  allowed: 'Only values from these sources are used. Leave empty to accept every source.',
  lookup: 'The lookup file or KV store collection to read. It must be shared with this app.',
  sname: 'The label used in the merge search. Letters, digits and underscores; must be unique.',
  enabled: 'A disabled source is skipped by the merge but keeps its settings.',
  role: 'Authoritative sources create assets and link them. Enrich-only sources attach values to one existing asset and never link assets.',
  ts: 'The column that says when a row was last true. Used for Max age and for Latest merges.',
  age: 'Rows older than this, by the timestamp column, are ignored. 0 keeps every row.',
  filter: 'Optional condition applied while the lookup is read, for example severity>=3.',
  scope: 'Keeps keys from different sites apart: the same IP in two scopes is two assets.',
  mapping: 'Rename lookup columns to asset fields. Columns whose name already matches a field are used as they are.',
  max_keys: 'Clusters with more keys than this are dropped or listed for review. The hard cap is 100.',
  max_key_share: 'A value shared by more rows than this, such as a default gateway, is not used to link assets.',
  min_ratio: 'Skip writing if the new asset count falls below this share of the previous run.',
  runs_to_keep: 'Older run records are removed from the run history.',
  change_history: 'Record which fields changed between runs. Needed for the change log.',
  history_rows: 'The oldest change records drop off first.',
  blocklist: 'Never used to link assets. Applies to every key field.',
  gignore: 'Removed from every field that inherits it. Prefix with re: for a regex or cidr: for a network.',
};

/* ---------- Data ---------- */
const CATALOG = [
  { app: 'TA-microsoft-ad', name: 'ad_computers', cols: ['dnsHostName', 'operatingSystem', 'managedBy', 'whenChanged'], rows: [['wks-0142.corp.example', 'Windows 11', 'jlee', '2026-10-30'], ['srv-db-07.corp.example', 'Windows Server 2022', 'dba-team', '2026-10-29']] },
  { app: 'search', name: 'dhcp_leases', cols: ['ip', 'mac', 'client_hostname', 'lease_end'], rows: [['10.4.2.17', '3C:22:FB:0A:9E:11', 'wks-0142', '2026-11-01'], ['10.4.9.80', 'A4:83:E7:51:20:CC', 'printer-3f', '2026-11-01']] },
  { app: 'Splunk_TA_crowdstrike', name: 'crowdstrike_hosts', cols: ['hostname', 'local_ip', 'mac_address', 'platform_name', 'last_seen'], rows: [['WKS-0142', '10.4.2.17', '3c-22-fb-0a-9e-11', 'Windows', '2026-10-31'], ['MBP-RHO', '10.4.7.33', '8c-85-90-1b-aa-02', 'Mac', '2026-10-31']] },
  { app: 'search', name: 'nessus_findings', cols: ['host', 'ip', 'severity', 'plugin_id', 'cve'], rows: [['wks-0142', '10.4.2.17', '3', '19506', 'CVE-2026-1001'], ['srv-db-07', '10.4.8.5', '4', '51192', 'CVE-2026-2290']] },
  { app: 'search', name: 'cmdb_export', cols: ['ci_name', 'serial_number', 'owner', 'site'], rows: [['wks-0142', 'C02XK1', 'jlee', 'AMS'], ['srv-db-07', 'VMw-4207', 'dba-team', 'FRA']] },
  { app: 'TA-microsoft-defender', name: 'defender_devices', cols: ['computerDnsName', 'lastIpAddress', 'osPlatform', 'riskScore', 'lastSeen'], rows: [['wks-0142.corp.example', '10.4.2.17', 'Windows11', 'Low', '2026-10-31'], ['srv-db-07.corp.example', '10.4.8.5', 'WindowsServer2022', 'Medium', '2026-10-30']] },
  { app: 'TA-tenable', name: 'tenable_assets', cols: ['fqdn', 'ipv4', 'mac_address', 'operating_system', 'last_seen'], rows: [['wks-0142.corp.example', '10.4.2.17', '3c:22:fb:0a:9e:11', 'Windows 11', '2026-10-29'], ['srv-db-07.corp.example', '10.4.8.5', '00:50:56:a1:07:5c', 'Windows Server 2022', '2026-10-29']] },
  { app: 'search', name: 'legacy_export (unreadable)', cols: [], rows: [] },
];
function f(name, description, key, cs, merge, norm, ignore, o) {
  return { name, description, enabled: true, key: !!key, cs: !!cs, merge, norm, ignore, inherit: true, validation: o.validation || 'none', valueType: o.valueType || 'string', keepCase: !!o.keepCase, track: false, maxValues: 10, allowed: o.allowed || [] };
}
const initialData = () => ({
  sources: [
    { id: 's1', name: 'ad_computers', lookup: 'ad_computers', app: 'TA-microsoft-ad', enabled: true, role: 'auth', scope: '', age: 7, ageUnit: 'd', timeCol: '_time', filter: '', map: [{ to: 'hostname', from: 'dnsHostName' }, { to: 'os', from: 'operatingSystem' }], rows: 14210 },
    { id: 's2', name: 'dhcp_leases', lookup: 'dhcp_leases', app: 'search', enabled: true, role: 'auth', scope: '', age: 2, ageUnit: 'd', timeCol: 'lease_end', filter: '', map: [{ to: 'hostname', from: 'client_hostname' }], rows: 9822 },
    { id: 's3', name: 'crowdstrike_hosts', lookup: 'crowdstrike_hosts', app: 'Splunk_TA_crowdstrike', enabled: true, role: 'auth', scope: '', age: 3, ageUnit: 'd', timeCol: 'last_seen', filter: '', map: [{ to: 'ip', from: 'local_ip' }, { to: 'mac', from: 'mac_address' }, { to: 'os', from: 'platform_name' }], rows: 31400 },
    { id: 's4', name: 'nessus_findings', lookup: 'nessus_findings', app: 'search', enabled: true, role: 'enrich', scope: '', age: 30, ageUnit: 'd', timeCol: '_time', filter: 'severity>=3', map: [{ to: 'hostname', from: 'host' }, { to: 'vuln_count', from: 'plugin_id' }], rows: 9100 },
    { id: 's5', name: 'cmdb_export', lookup: 'cmdb_export', app: 'search', enabled: false, role: 'auth', scope: 'site', age: 0, ageUnit: 'd', timeCol: '_time', filter: '', map: [{ to: 'hostname', from: 'ci_name' }, { to: 'owner', from: 'owner' }], rows: 12044 },
    { id: 's6', name: 'legacy_assets', lookup: 'legacy_assets', app: 'search', enabled: true, role: 'auth', scope: '', age: 0, ageUnit: 'd', timeCol: '_time', filter: '', map: [], rows: 0 },
  ],
  fields: [
    f('hostname', 'Host name, short form', 1, 0, 'coalesce', 'hostname', ['localhost', 're:^test-'], {}),
    f('ip', 'IP address (IPv4)', 1, 0, 'latest', 'ip', ['cidr:169.254.0.0/16', '0.0.0.0'], { validation: 'ipv4' }),
    f('mac', 'Hardware address', 1, 0, 'latest', 'mac', ['00:00:00:00:00:00'], {}),
    f('serial', 'Serial or asset tag', 1, 1, 'coalesce', 'trim', [], { keepCase: true }),
    f('os', 'Operating system', 0, 0, 'latest', 'default', [], {}),
    f('owner', 'Responsible person or team', 0, 0, 'coalesce', 'lowercase', [], { allowed: ['cmdb_export'] }),
    f('vuln_count', 'Open findings', 0, 1, 'max', 'none', [], { valueType: 'number' }),
    f('site', 'Location code', 0, 0, 'latest', 'default', [], {}),
  ],
  settings: { max_keys: 12, max_key_share: 200, min_ratio: 80, runs_to_keep: 30, change_history: true, history_rows: 5000, blocklist: ['unknown', 'n/a', 'none'], ignore: ['localhost', 're:^test-'] },
});
const RUNS = [
  { t: 'Yesterday 03:10', st: 'ok', out: 41660, d: '+34', dur: '2m 38s' },
  { t: 'Oct 29 03:10', st: 'warn', out: 41626, d: '-1,902', dur: '2m 44s' },
  { t: 'Oct 28 03:10', st: 'ok', out: 43528, d: '+90', dur: '2m 40s' },
  { t: 'Oct 27 03:10', st: 'ok', out: 43438, d: '+12', dur: '2m 39s' },
];

let D = initialData();
const ui = { scenario: 'normal', tab: 'fields', filter: '', drawer: null, save: 'saved', banner: null, running: false, searchStale: false, run: { time: 'Today 03:10', status: 'ok', assets: 41872, delta: '+212' }, expanded: new Set(), failNext: '', clicks: 0, prevSpl: [], retry: null, previewState: 'idle', previewVals: null, previewSid: null, sdraft: null, advOpen: false };

/* ---------- Utilities ---------- */
const live = (m) => { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = m; }, 30); };
const fid = () => { const a = document.activeElement; return a && a.dataset && a.dataset.fid ? a.dataset.fid : null; };
const refocus = (id) => { if (!id) return; const el = $(`[data-fid="${CSS.escape(id)}"]`); if (el) el.focus({ preventScroll: true }); };
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `${ico('check')}<span>${esc(msg)}</span>`; $('#toasts').replaceChildren(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 180); }, 4500);
}

/* ---------- Form building blocks (one look for every input) ---------- */
let tipN = 0;
const tip = (text, label) => { const id = 'tip' + (++tipN); return `<span class="tip"><button type="button" class="tip-b" aria-label="About ${esc(label)}" aria-describedby="${id}">i</button><span role="tooltip" id="${id}" class="tip-t">${esc(text)}</span></span>`; };
const labelRow = (forId, text, tipKey, optional) => `<div class="lrow"><label for="${forId}">${text}${optional ? ' <span class="optl">(optional)</span>' : ''}</label>${tipKey ? tip(TIPS[tipKey], text) : ''}</div>`;
const selectField = (id, key, text, tipKey, opts, val, extra = '') => `<div>${labelRow(id, text, tipKey)}<select class="inp" id="${id}" data-d="${key}" data-fid="${id}" ${extra}>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
const textField = (id, key, text, tipKey, val, o = {}) => `<div>${labelRow(id, text, tipKey, o.optional)}<input class="inp ${o.mono ? 'mono' : ''}" id="${id}" data-d="${key}" data-fid="${id}" value="${esc(val)}" placeholder="${esc(o.ph || '')}" autocomplete="off" spellcheck="false" ${o.err ? `aria-describedby="${id}-e"` : ''}>${o.err ? `<div class="err" id="${id}-e" hidden></div>` : ''}</div>`;
const switchRow = (key, text, tipKey, val, act = 'dswitch') => { const id = 'sw-' + key; return `<div class="srow"><div class="lrow"><span class="l" id="${id}-l">${text}</span>${tip(TIPS[tipKey], text)}</div><button class="switch" id="${id}" type="button" role="switch" aria-checked="${val}" aria-labelledby="${id}-l" data-act="${act}" data-d="${key}" data-k="${key}" data-fid="${id}"></button></div>`; };
const segField = (key, text, tipKey, opts, val) => `<div><div class="lrow"><span class="l" id="seg-${key}-l">${text}</span>${tip(TIPS[tipKey], text)}</div><div class="seg" role="radiogroup" aria-labelledby="seg-${key}-l">${opts.map(([v, l]) => `<label><input type="radio" name="${key}" value="${v}" ${v === val ? 'checked' : ''} data-d="${key}" data-fid="seg-${key}-${v}">${l}</label>`).join('')}</div></div>`;
const numberField = (id, key, text, tipKey, val, o = {}) => `<div>${labelRow(id, text, tipKey)}<div class="w-num">${o.suffix ? `<div class="compound"><input class="inp" type="number" id="${id}" min="${o.min ?? 0}" max="${o.max ?? ''}" value="${val}" data-d="${key}" data-fid="${id}"><span class="suffix">${o.suffix}</span></div>` : `<input class="inp" type="number" id="${id}" min="${o.min ?? 0}" max="${o.max ?? ''}" value="${val}" data-d="${key}" data-fid="${id}">`}</div></div>`;
const chipsField = (id, text, tipKey, vals, o = {}) => `<div>${labelRow('chip-' + id, text, tipKey)}${chipsHtml(id, vals, 'chip-' + id, o)}</div>`;

/* ---------- Dirty tracking: nothing is written until Save ---------- */
const drawerDirty = () => !!(ui.drawer && ui.drawer.draft && JSON.stringify(ui.drawer.draft) !== ui.drawer.orig);
const settingsDirty = () => !!(ui.sdraft && JSON.stringify(ui.sdraft) !== JSON.stringify(D.settings));
const anyDirty = () => drawerDirty() || settingsDirty();
function guard(proceed) {
  if (!anyDirty()) { proceed(); return; }
  const what = drawerDirty() ? (ui.drawer.kind === 'field' ? 'field' : 'source') : 'settings';
  openModal({ title: 'Discard unsaved changes?', body: `Your edits to this ${what} have not been saved and will be lost.`, confirm: 'Discard changes', cancel: 'Keep editing', destructive: true,
    onConfirm: () => { if (ui.drawer && ui.drawer.draft) ui.drawer.orig = JSON.stringify(ui.drawer.draft); if (ui.sdraft) ui.sdraft = clone(D.settings); proceed(); } });
}

/* ---------- Write chain with visible state ---------- */
function updateSaveState() {
  const el = $('.savestate'); if (!el) return;
  const dirty = anyDirty() && ui.save === 'saved';
  const strip = $('.d-status'); if (strip) strip.dataset.state = ui.save === 'failed' ? 'failed' : ui.save === 'saving' ? 'saving' : dirty ? 'dirty' : 'saved';
  el.innerHTML = ui.scenario === 'loading' ? '' : ui.save === 'saving' ? '<span class="spin" aria-hidden="true"></span>Saving…' : ui.save === 'failed' ? `${ico('alert')}Not fully saved` : dirty ? `${ico('edit')}Unsaved changes` : '<svg class="ico tick" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>All changes saved';
}
function setSave(s) { ui.save = s; renderHeader(); syncSaveBtn(); }
async function persist(label, apply) {
  const before = buildSpl().map((l) => l.text);
  setSave('saving'); await wait(650);
  const fail = ui.failNext; ui.failNext = ''; $('#mk-fail').value = '';
  if (fail === 'conf') {
    ui.banner = { kind: 'bad', title: `Could not save “${label}”. Nothing was changed.`, text: 'Your edits are still open and nothing was written. Try again.', action: 'Try again', act: 'retry' };
    setSave('failed'); live(`Could not save ${label}. Nothing was changed.`); return false;
  }
  apply(); ui.prevSpl = before;
  if (fail === 'search') {
    ui.searchStale = true;
    ui.banner = { kind: 'bad', title: `Saved “${label}”, but the merge search was not updated.`, text: 'The scheduled run keeps using the previous search until you regenerate it.', action: 'Regenerate search', act: 'regen' };
    setSave('failed'); live('Saved, but the merge search was not updated.'); return true;
  }
  ui.searchStale = false; ui.banner = null;
  if (fail === 'sync') ui.banner = { kind: 'warn', title: `Saved “${label}”. Field types are out of sync.`, text: 'Searches still work. Sync the KV store field types to finish.', action: 'Retry sync', act: 'sync' };
  setSave('saved'); live(`${label} saved`); return true;
}

/* ---------- Header: section nav, run action, status strip (Splunk provides the app navigation) ---------- */
const TABS = [['sources', 'Sources'], ['fields', 'Fields'], ['pipeline', 'Pipeline'], ['settings', 'Settings']];
function renderHeader() {
  const h = $('#hdr'); const before = fid();
  const loading = ui.scenario === 'loading'; const never = ui.run.status === 'never';
  const cnt = { sources: D.sources.length, fields: D.fields.length };
  const meta = loading ? '' : never ? 'Never run' : `Last run ${esc(ui.run.time)} · ${ui.run.assets.toLocaleString()} assets <span class="delta ${ui.run.delta.startsWith('-') ? 'neg' : ''}">${esc(ui.run.delta)}</span> · merge search ${ui.searchStale ? '<span class="pill bad">out of date</span>' : 'up to date'}${attention() ? ` · <span class="attn">${attention()} item${attention() > 1 ? 's' : ''} ${attention() > 1 ? 'need' : 'needs'} attention</span>` : ''}`;
  const runDisabled = loading || ui.running || (never && !(D.sources.length && D.fields.length));
  h.innerHTML = `<div class="d-in" style="padding-top:8px"><div class="d-subnav"><div class="tabs" role="tablist" aria-label="Configure sections">${TABS.map(([id, label]) => `<button class="tab" role="tab" id="tab-${id}" data-tab="${id}" data-fid="tab-${id}" aria-selected="${ui.tab === id}" aria-controls="panel" tabindex="${ui.tab === id ? 0 : -1}">${label}${cnt[id] != null && !loading ? `<span class="n">${cnt[id]}</span>` : ''}</button>`).join('')}</div>
    <div class="d-run"><span>Next run <b>${never ? 'not scheduled' : 'tomorrow, 03:00'}</b></span><button class="btn" type="button" data-act="run" data-fid="run" ${runDisabled ? 'disabled' : ''}>${ui.running ? '<span class="spin" aria-hidden="true"></span>Merging…' : `${ico('play')}Run now`}</button></div></div>
    <div class="d-status" data-state="saved"><span class="savestate" role="status" aria-live="polite"></span><span class="d-meta">${meta}</span><button class="linkbtn" type="button" data-act="runs" data-fid="status" ${loading ? 'disabled' : ''}>Run history</button></div>
    <div class="runbar ${ui.running ? 'on' : ''}" aria-hidden="true"></div><div id="banner"></div></div>`;
  updateSaveState(); renderBanner(); refocus(before);
}
function renderBanner() {
  const b = $('#banner'); if (!b) return; const x = ui.banner;
  b.innerHTML = x ? `<div class="banner ${x.kind}" role="alert">${ico('alert')}<div class="grow"><b>${esc(x.title)}</b><div class="muted">${esc(x.text)}</div></div><button class="btn sm" type="button" data-act="${x.act}" data-fid="banner-act">${esc(x.action)}</button><button class="btn icon" type="button" data-act="dismissBanner" aria-label="Dismiss">${ico('x')}</button></div>` : '';
}

/* ---------- Pane router ---------- */
function renderMain() {
  $('#main').innerHTML = `<div id="head"></div><div class="layout" id="layout"><section id="panel" role="tabpanel" aria-labelledby="tab-${ui.tab}" tabindex="-1" style="min-width:0"></section><aside id="drawer" aria-label="Editor" hidden></aside></div>`;
  renderPane(); if (ui.drawer) mountDrawer(true);
}
function pageHead() {
  if (!D.sources.length && ui.tab === 'sources') return '';
  const H = { sources: ['Sources', 'Source lookups that feed the asset list. Enrich-only sources never create assets.', `<button class="btn primary" type="button" data-act="addSource" data-fid="add-source">${ico('plus')}Add source</button>`],
    fields: ['Fields', 'Key fields decide which records are the same asset. Every field is merged onto that asset.', `<button class="btn" type="button" data-act="preset" data-fid="presets">Add CIM preset</button><button class="btn primary" type="button" data-act="addField" data-fid="add-field">${ico('plus')}Add field</button>`],
    pipeline: ['Pipeline', 'How the merge search is built, stage by stage.', ''], settings: ['Settings', 'Options that apply to the whole merge.', ''] }[ui.tab];
  return `<div class="d-head"><div><h1>${H[0]}</h1><p>${H[1]}</p></div><div class="d-actions">${H[2]}</div></div>`;
}
function renderPane() {
  const p = $('#panel'); if (!p) return; const before = fid();
  p.setAttribute('aria-labelledby', `tab-${ui.tab}`);
  $('#head').innerHTML = ui.scenario === 'loading' ? '' : pageHead();
  p.innerHTML = ui.scenario === 'loading' ? skeleton() : ({ sources: paneSources, fields: paneFields, pipeline: panePipeline, settings: paneSettings })[ui.tab]();
  $('#layout').classList.toggle('with-drawer', !!ui.drawer);
  refocus(before);
}
const skeleton = () => `<div class="panel" aria-busy="true">${Array.from({ length: 7 }, () => `<div style="display:flex;gap:24px;padding:16px 20px;border-top:1px solid var(--line)"><div style="flex:2"><div class="skel" style="width:140px"></div><div class="skel" style="width:220px;margin-top:6px;height:10px"></div></div><div class="skel" style="flex:1"></div><div class="skel" style="flex:1"></div><div class="skel" style="flex:1"></div><div class="skel" style="flex:2"></div></div>`).join('')}</div>`;

/* ---------- Tables: read-only, actions in the row ---------- */
const enabledFields = () => D.fields.filter((x) => x.enabled !== false);
function supplies(fieldName) { return D.sources.some((s) => s.enabled && (s.map.some((m) => m.to === fieldName && m.from) || ((CATALOG.find((c) => c.name === s.lookup) || { cols: [] }).cols.includes(fieldName)))); }
function problems(kind, item) {
  const out = [];
  if (kind === 'source') {
    if (!CATALOG.some((c) => c.name === item.lookup)) out.push({ sev: 'bad', text: `The lookup “${item.lookup}” no longer exists, so this source is skipped by the merge. Edit it to pick another lookup, or remove it.` });
    else if (item.enabled && item.rows === 0) out.push({ sev: 'warn', text: 'This source returned no rows in the last run.' });
  } else if (item.enabled !== false) {
    if (!supplies(item.name)) out.push({ sev: 'warn', text: item.key ? 'No enabled source supplies this key field, so it cannot match any records. Map a column to it in a source, or enable a source that has it.' : 'No enabled source supplies this field, so it will always be empty.' });
  }
  return out;
}
const flag = (list) => { if (!list.length) return ''; const id = 'tip' + (++tipN); const sev = list.some((q) => q.sev === 'bad') ? 'bad' : 'warn'; return `<span class="tip"><button type="button" class="tip-b flag ${sev}" aria-label="Needs attention" aria-describedby="${id}">${ico('alert')}</button><span role="tooltip" id="${id}" class="tip-t">${esc(list.map((q) => q.text).join(' '))}</span></span>`; };
const needs = (n) => `${n} ${n === 1 ? 'needs' : 'need'} attention`;
const attention = () => D.sources.filter((x) => problems('source', x).length).length + D.fields.filter((x) => problems('field', x).length).length;
const enabledSwitch = (kind, id, name, on, editing) => `<td class="sw"><button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Enabled, ${kind} ${esc(name)}" data-act="toggleRow" data-kind="${kind}" data-id="${esc(id)}" data-fid="en-${kind}-${esc(id)}" ${editing ? 'disabled title="Being edited: change it in the editor"' : ''}></button></td>`;
const rowActions = (kind, id, name) => `<td class="act"><button class="btn icon" type="button" data-act="${kind === 'field' ? 'editField' : 'editSource'}" data-id="${esc(id)}" data-fid="${kind === 'field' ? 'fld' : 'src'}-${esc(id)}" aria-label="Edit ${kind} ${esc(name)}" title="Edit">${ico('edit')}</button><button class="btn icon" type="button" data-act="dupRow" data-kind="${kind}" data-id="${esc(id)}" aria-label="Duplicate ${kind} ${esc(name)}" title="Duplicate">${ico('dup')}</button><button class="btn icon danger" type="button" data-act="rmRow" data-kind="${kind}" data-id="${esc(id)}" aria-label="Remove ${kind} ${esc(name)}" title="Remove">${ico('trash')}</button></td>`;
function paneSources() {
  if (!D.sources.length) return emptyFirstRun();
  return `<div class="panel"><table class="tbl"><caption class="sr-only">Source lookups</caption>
    <thead><tr><th scope="col">Source</th><th scope="col">Role</th><th scope="col" class="hide-s hide-d">Scope</th><th scope="col" class="hide-s hide-d">Max age</th><th scope="col" class="num">Rows</th><th scope="col">Enabled</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${D.sources.map((s) => { const ed = !!ui.drawer && ui.drawer.kind === 'source' && ui.drawer.id === s.id; return `<tr data-open data-id="${s.id}" data-active="${ed}" class="${s.enabled ? '' : 'off'}">
      <td><span class="fname">${esc(s.name)}</span>${flag(problems('source', s))}<small>${esc(s.lookup)}</small></td>
      <td>${s.role === 'auth' ? 'Authoritative' : 'Enrich only'}</td>
      <td class="hide-s hide-d">${s.scope ? esc(s.scope) : '—'}</td><td class="hide-s hide-d">${s.age ? s.age + s.ageUnit : '—'}</td>
      <td class="num">${s.rows.toLocaleString()}</td>${enabledSwitch('source', s.id, s.name, s.enabled, ed)}${rowActions('source', s.id, s.name)}</tr>`; }).join('')}</tbody></table>
    <div class="tbl-foot">${D.sources.filter((s) => s.enabled).length} of ${D.sources.length} enabled${D.sources.filter((x) => problems('source', x).length).length ? ` · <span class="attn">${D.sources.filter((x) => problems('source', x).length).length} ${'' }</span>` : ''}. Merged into the <span class="mono">assetdb</span> collection: ${ui.run.assets ? ui.run.assets.toLocaleString() + ' assets' : 'not run yet'}.</div></div>`;
}
function emptyFirstRun() {
  const st = [D.sources.length > 0, D.fields.length > 0, ui.run.status !== 'never'];
  return `<div class="panel"><div class="empty"><h2>Bring your asset lists together</h2>
    <p>AssetDB merges records from several lookups into one asset per device, matched on the fields you choose (host name, IP, MAC).</p>
    <div class="check"><strong>Get started</strong><ul>${[['Add a source lookup', 'addSource', 'Add source'], ['Choose the fields to match and merge', 'preset', 'Add CIM preset'], ['Run the first merge', 'run', 'Run now']].map(([t, a, b], i) => `<li data-done="${st[i]}"><span class="n">${st[i] ? ico('check') : i + 1}</span><span class="t" style="flex:1">${t}</span>${st[i] ? '' : `<button class="btn sm ${i === st.findIndex((x) => !x) ? 'primary' : ''}" type="button" data-act="${a}" ${i === 2 && (!st[0] || !st[1]) ? 'disabled' : ''}>${b}</button>`}</li>`).join('')}</ul></div>
    <p class="hint">This card disappears once all three steps are done.</p></div></div>`;
}
function visibleFields() {
  const q = ui.filter.trim().toLowerCase();
  return D.fields.filter((x) => !q || x.name.includes(q) || x.description.toLowerCase().includes(q)).sort((a, b) => (b.key - a.key) || a.name.localeCompare(b.name));
}
function paneFields() {
  if (!D.fields.length) return `<div class="panel"><div class="empty"><h2>No fields yet</h2><p>Fields decide what is matched and what is kept. Start from the common security fields, or define your own.</p><div style="display:flex;gap:8px"><button class="btn primary" type="button" data-act="preset">Add CIM preset</button><button class="btn" type="button" data-act="addField">Add field</button></div></div></div>`;
  const list = visibleFields();
  return `<div class="panel"><div class="searchbar"><div class="search"><svg class="ico" aria-hidden="true"><use href="#i-search"/></svg><input id="f-filter" class="inp" type="search" placeholder="Filter fields   ( / )" aria-label="Filter fields" value="${esc(ui.filter)}" data-fid="filter"></div></div>
    <table class="tbl"><caption class="sr-only">Fields. Match keys are listed first.</caption>
      <thead><tr><th scope="col">Field</th><th scope="col">Description</th><th scope="col">Enabled</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${list.map((x) => { const ed = !!ui.drawer && ui.drawer.kind === 'field' && ui.drawer.id === x.name; return `<tr data-open data-id="${esc(x.name)}" data-active="${ed}" class="${x.enabled !== false ? '' : 'off'}">
          <td><span class="kslot">${x.key ? `<span class="keymark" title="Key field">${ico('key')}<span class="sr-only">Key field</span></span>` : ''}</span><span class="fname">${esc(x.name)}</span>${flag(problems('field', x))}</td>
          <td class="muted">${esc(x.description) || '—'}</td>${enabledSwitch('field', x.name, x.name, x.enabled !== false, ed)}${rowActions('field', x.name, x.name)}</tr>`; }).join('')}</tbody></table>
    ${list.length ? '' : `<div class="empty"><h2>No fields match</h2><p>Nothing matches “${esc(ui.filter)}”.</p><button class="btn" type="button" data-act="clearFilter">Clear filter</button></div>`}
    <div class="tbl-foot">${D.fields.length} fields, ${D.fields.filter((x) => x.key).length} are match keys${D.fields.filter((x) => problems('field', x).length).length ? ` · <span class="attn">${needs(D.fields.filter((x) => problems('field', x).length).length)}</span>` : ''}.</div></div>`;
}

/* ---------- Pipeline + SPL ---------- */
const STAGES = [['Load sources', 'sources'], ['Map columns and filter rows', 'sources'], ['Clean values', 'fields'], ['Build match keys', 'fields'], ['Merge records that share a key', 'settings'], ['Combine field values', 'fields'], ['Safety checks and write', 'settings']];
function buildSpl() {
  const { sources, settings } = D; const fields = enabledFields(); const L = []; const add = (st, text) => L.push({ st, text });
  const on = sources.filter((s) => s.enabled); const keys = fields.filter((x) => x.key);
  on.forEach((s, i) => add(0, i ? `| append [| \`input_adb_lookup(${s.lookup})\`]` : `| \`input_adb_lookup(${s.lookup})\``));
  const enr = on.filter((s) => s.role === 'enrich');
  if (enr.length) add(0, `| eval adb_auth=case(${enr.map((s) => `source_lookup="${s.lookup}", 0`).join(', ')}, true(), 1)`);
  on.forEach((s) => s.map.filter((m) => m.to && m.from).forEach((m) => add(1, `| eval ${m.to} = case(source_lookup="${s.lookup}", ${m.from}, true(), ${m.to})`)));
  on.filter((s) => s.filter).forEach((s) => add(1, `| where source_lookup!="${s.lookup}" OR (${s.filter})`));
  on.filter((s) => s.age).forEach((s) => add(1, `| where source_lookup!="${s.lookup}" OR ${s.timeCol === '_time' ? '_time' : 'strptime(' + s.timeCol + ', "%Y-%m-%d")'}>=relative_time(now(), "-${s.age}${s.ageUnit}")`));
  fields.forEach((x) => {
    const n = x.norm === 'default' ? 'none' : x.norm;
    if (n !== 'none') add(2, `| \`normalize_${n}(${x.name})\``);
    x.ignore.forEach((v) => {
      const lc = x.cs ? x.name : `lower(${x.name})`;
      if (v.startsWith('re:')) add(2, `| eval ${x.name} = mvfilter(NOT match(${lc}, "${v.slice(3)}"))`);
      else if (v.startsWith('cidr:')) add(2, `| eval ${x.name} = mvfilter(NOT cidrmatch("${v.slice(5)}", ${x.name}))`);
      else add(2, `| eval ${x.name} = mvfilter(NOT in(${lc}, "${v}"))`);
    });
    if (x.validation === 'ipv4') add(2, `| eval ${x.name} = mvfilter(match(${x.name}, "^\\d{1,3}(\\.\\d{1,3}){3}$"))`);
  });
  if (keys.length) {
    add(3, `| eval ${keys.map((k) => `adbk_${k.name} = ${k.cs || k.keepCase ? k.name : 'lower(' + k.name + ')'}`).join(', ')}`);
    if (settings.blocklist.length) add(3, `| eval ${keys.map((k) => `adbk_${k.name} = mvfilter(NOT in(adbk_${k.name}, ${settings.blocklist.map((b) => `"${b}"`).join(', ')}))`).join(', ')}`);
    add(3, `| eval asset = mvappend(${keys.map((k) => 'adbk_' + k.name).join(', ')})`);
  }
  add(4, `| adbmerge max_keys=${settings.max_keys} max_key_share=${settings.max_key_share} overflow=emit`);
  add(5, `| stats values(source) as source, max(_time) as last_seen, ${fields.map((x) => `${x.merge === 'coalesce' ? 'latest' : x.merge}(${x.name}) as ${x.name}`).join(', ')} by _key`);
  add(6, `\`\`\`abort if the new asset count is below ${settings.min_ratio}% of the last good run\`\`\``);
  add(6, '| outputlookup override_if_empty=false assetdb');
  add(6, '| appendpipe [| stats count as assets_out | outputlookup append=true assetdb_runs]');
  if (settings.change_history) add(6, `| inputlookup append=true assetdb_changes | head ${settings.history_rows} | outputlookup assetdb_changes`);
  return L;
}
function hl(line) {
  return line.replace(/(```[^`]*```)|(`[^`]*`)|("(?:[^"\\]|\\.)*")|(^\||\[\|)\s*([a-z_]+)|(\b\d+(?:\.\d+)?\b)|([&<>])/g, (m, com, mac, str, pipe, cmd, num, amp) => {
    if (com) return `<span class="tk-com">${esc(com)}</span>`;
    if (mac) return `<span class="tk-macro">${esc(mac)}</span>`;
    if (str) return `<span class="tk-str">${esc(str)}</span>`;
    if (pipe) return `${esc(pipe)} <span class="tk-cmd">${esc(cmd)}</span>`;
    if (num) return `<span class="tk-num">${num}</span>`;
    return esc(amp);
  });
}
function codeBlock(lines, prev) {
  const known = new Set(prev || []);
  return `<div class="code" role="region" tabindex="0" aria-label="Generated search">${lines.map((l, i) => `<div class="ln ${prev && prev.length && !known.has(l.text) ? 'new' : ''}"><i>${i + 1}</i><span>${hl(l.text)}</span></div>`).join('')}</div>`;
}
function stageSummary(i) {
  const on = D.sources.filter((s) => s.enabled); const S = D.settings;
  return [`${on.length} sources, ${on.filter((s) => s.role === 'enrich').length} enrich-only`, `${on.reduce((a, s) => a + s.map.length, 0)} column mappings, ${on.filter((s) => s.filter).length} row filters, ${on.filter((s) => s.age).length} age limits`,
    `${enabledFields().filter((x) => !['default', 'none'].includes(x.norm)).length} normalisers, ${enabledFields().reduce((a, x) => a + x.ignore.length, 0)} ignore entries`, `${enabledFields().filter((x) => x.key).map((x) => x.name).join(', ') || 'no key fields yet'}; ${S.blocklist.length} blocked values`,
    `adbmerge, up to ${S.max_keys} keys per asset, shared keys over ${S.max_key_share} rows skipped`, `${enabledFields().length} fields, ${[...new Set(enabledFields().map((x) => x.merge))].join(' / ')}`, `Abort below ${S.min_ratio}% of the last run, never write an empty result`][i];
}
function panePipeline() {
  const spl = buildSpl(); const p = ui.previewVals; const prev = ui.prevSpl;
  const kp = ui.previewState === 'loading' ? Array.from({ length: 4 }, () => `<div class="kpi"><div class="skel" style="height:28px;width:70%"></div><div class="skel" style="height:10px;width:50%;margin-top:8px"></div></div>`).join('') :
    p ? [[p.assets.toLocaleString(), 'assets after merge'], [p.overflow, 'oversized clusters'], [p.nokey, 'rows without a key'], [p.shared, 'shared keys skipped']].map(([v, k]) => `<div class="kpi"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('') : '';
  const out = `<div class="panel" style="margin-bottom:24px"><div class="toolbar"><h2>Preview</h2><span class="muted">Dry run on the saved settings. Nothing is written.</span><span class="grow"></span><button class="btn" type="button" data-act="preview" data-fid="preview" ${ui.previewState === 'loading' ? 'disabled' : ''}>${ui.previewState === 'loading' ? '<span class="spin"></span>Running…' : `${ico('play')}Run preview`}</button>${ui.previewSid ? `<a class="btn" href="#" data-act="openPreview" data-fid="open-preview" title="Open this preview search job in the Search app, in a new window">${ico('copy')}Open in Search</a>` : ''}</div>
    ${kp ? `<div class="cards3" aria-live="polite">${kp}</div>` : '<p class="hint" style="padding:0 20px 16px;margin:0">Run a preview to see how many assets this configuration would produce.</p>'}</div>
  <div class="panel"><div class="toolbar"><h2>Stages</h2><span class="muted">${spl.length} lines</span><span class="grow"></span><button class="btn" type="button" data-act="expandAll">Expand all</button></div>
  <div class="stages">${STAGES.map(([t, owner], i) => {
    const open = ui.expanded.has(i); const lines = spl.filter((l) => l.st === i);
    return `<div class="stage"><button class="stage-h" type="button" data-act="stage" data-id="${i}" data-fid="stage-${i}" aria-expanded="${open}" aria-controls="sb-${i}"><span class="num">${i + 1}</span><span class="grow"><span class="t">${t}</span><br><span class="muted" style="font-size:13px">${esc(stageSummary(i))}</span></span><span class="muted" style="font-size:13px">${lines.length} lines</span>${ico('chev').replace('class="ico"', 'class="ico chev"')}</button>
      <div class="stage-body" id="sb-${i}" ${open ? '' : 'hidden'}>${lines.length ? codeBlock(lines, prev) : '<p class="hint">No lines at the moment.</p>'}<p style="margin:12px 0 0"><button class="btn sm" type="button" data-act="goto" data-id="${owner}">Edit in ${owner[0].toUpperCase() + owner.slice(1)}</button></p></div></div>`;
  }).join('')}</div></div>
  <details class="panel" style="margin-top:24px" ${ui.expanded.has('raw') ? 'open' : ''} data-act-toggle="raw"><summary style="padding:14px 20px;cursor:pointer;font-weight:600">Raw search <span class="muted" style="font-weight:400">(${spl.length} lines${ui.searchStale ? ' · out of date' : ''})</span></summary>
    <div style="padding:0 20px 20px"><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn sm" type="button" data-act="copy" data-fid="copy">${ico('copy')}Copy</button><a class="btn sm" href="#" data-act="openSearch">Open in Search</a></div>${codeBlock(spl, prev)}</div></details>`;
  ui.prevSpl = [];
  return out;
}

/* ---------- Settings (draft, saved with its own button) ---------- */
function paneSettings() {
  if (!ui.sdraft) ui.sdraft = clone(D.settings);
  const S = ui.sdraft; const dirty = settingsDirty();
  const num = (k, label, max, min, suffix) => `<div class="srow2"><div class="lrow"><label for="st-${k}">${label}</label>${tip(TIPS[k], label)}</div><div><div class="w-num">${suffix ? `<div class="compound"><input class="inp" type="number" id="st-${k}" min="${min}" max="${max}" value="${S[k]}" data-s="${k}" data-min="${min}" data-max="${max}" data-fid="st-${k}" aria-describedby="st-${k}-e"><span class="suffix">${suffix}</span></div>` : `<input class="inp" type="number" id="st-${k}" min="${min}" max="${max}" value="${S[k]}" data-s="${k}" data-min="${min}" data-max="${max}" data-fid="st-${k}" aria-describedby="st-${k}-e">`}</div><div class="err" id="st-${k}-e" hidden></div></div></div>`;
  const group = (title, desc, rows) => `<section class="sgroup" aria-labelledby="g-${title.replace(/\W/g, '')}"><header><h2 id="g-${title.replace(/\W/g, '')}">${title}</h2><p>${desc}</p></header>${rows}</section>`;
  return `${group('Limits', 'Guards that stop bad data from merging unrelated assets.', num('max_keys', 'Max keys per asset', 100, 1) + num('max_key_share', 'Max rows sharing a key', 100000, 2))}
    ${group('Run safety', 'Protects the asset list from a bad run.', num('min_ratio', 'Minimum size versus last run', 100, 0, '%') + `<div class="srow2"><div class="lrow"><span class="l">Overwrite with an empty result</span>${tip('An empty search result would otherwise wipe the collection, so it is never written. This cannot be turned off.', 'Overwrite with an empty result')}</div><div class="static">Never</div></div>`)}
    ${group('History', 'How much run and change history is kept.', num('runs_to_keep', 'Runs to keep', 1000, 1) + `<div class="srow2"><div class="lrow"><span class="l" id="sw-ch-l">Record changes between runs</span>${tip(TIPS.change_history, 'Record changes between runs')}</div><div><button class="switch" type="button" role="switch" aria-checked="${S.change_history}" aria-labelledby="sw-ch-l" data-act="sbool" data-k="change_history" data-fid="st-hist"></button></div></div>` + (S.change_history ? num('history_rows', 'Change log rows', 100000, 100) : ''))}
    ${group('Values to ignore', 'Placeholder values that should never link or fill assets.', `<div class="srow2"><div class="lrow"><label id="bl-l">Key blocklist</label>${tip(TIPS.blocklist, 'Key blocklist')}</div>${chipsHtml('blocklist', S.blocklist, 'bl-l')}</div><div class="srow2"><div class="lrow"><label id="ig-l">Global ignore list</label>${tip(TIPS.gignore, 'Global ignore list')}</div>${chipsHtml('globalIgnore', S.ignore, 'ig-l')}</div>`)}
    <div class="savebar"><span class="unsaved" ${dirty ? '' : 'hidden'}>Unsaved changes</span><button class="btn" type="button" data-act="sdiscard" ${dirty ? '' : 'disabled'}>Discard changes</button><button class="btn primary" type="button" data-act="ssave" data-fid="ssave" ${dirty && ui.save !== 'saving' ? '' : 'disabled'}>Save settings</button></div>`;
}
function refreshSettingsBar() {
  const bar = $('.savebar'); if (!bar) return; const d = settingsDirty();
  $('.unsaved', bar).hidden = !d; $('[data-act=sdiscard]', bar).disabled = !d; $('[data-act=ssave]', bar).disabled = !d || ui.save === 'saving';
}

/* ---------- Chips (draft arrays) ---------- */
function chipsHtml(id, vals, labelledby, o = {}) {
  return `<div data-chipwrap="${id}"><div class="chips" data-chips="${id}" role="group" aria-labelledby="${labelledby}">${vals.map((v, i) => chipHtml(id, v, i)).join('')}<input type="text" data-chip-input="${id}" data-fid="ci-${id}" aria-label="Add value" ${id === 'allowed' ? 'list="src-list"' : ''} placeholder="${vals.length ? '' : (id === 'allowed' ? 'All sources' : 'Type a value, press Enter')}"></div>${id === 'allowed' ? `<datalist id="src-list">${D.sources.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>` : ''}<div class="err" data-chip-err="${id}" hidden role="alert"></div></div>`;
}
function chipHtml(id, v, i) {
  const kind = v.startsWith('re:') ? 'regex' : v.startsWith('cidr:') ? 'cidr' : '';
  const shown = kind ? v.slice(v.indexOf(':') + 1) : v;
  return `<span class="chip">${kind ? `<span class="k">${kind}</span>` : ''}<span>${esc(shown)}</span><button type="button" data-chip-del="${id}" data-i="${i}" aria-label="Remove ${esc(v)}">${ico('x')}</button></span>`;
}
function chipError(id, v) {
  if (id === 'allowed') return D.sources.some((s) => s.name === v) ? '' : `“${v}” is not one of your sources.`;
  if (v.startsWith('re:')) { if (v.length === 3) return 'Enter a pattern after re:'; try { new RegExp(v.slice(3)); } catch (e) { return `“${v.slice(3)}” is not a valid regular expression.`; } }
  if (v.startsWith('cidr:') && !/^(\d{1,3}\.){3}\d{1,3}\/(\d|[12]\d|3[0-2])$/.test(v.slice(5))) return 'Use a network like 10.0.0.0/8.';
  return '';
}
const chipArr = (id) => id === 'blocklist' ? ui.sdraft.blocklist : id === 'globalIgnore' ? ui.sdraft.ignore : id === 'allowed' ? ui.drawer.draft.allowed : ui.drawer.draft.ignore;
function refreshChips(id) {
  const w = $(`[data-chipwrap="${CSS.escape(id)}"]`); if (!w) return; const lab = $('[data-chips]', w).getAttribute('aria-labelledby');
  w.outerHTML = chipsHtml(id, chipArr(id), lab); refocus(`ci-${id}`); onDraftChange();
}

/* ---------- Editor card: field, source, run history ---------- */
function openDrawer(kind, id, returnFid, extra = {}) {
  const run = () => {
    let draft = null;
    if (kind === 'field' && !extra.create) draft = clone(D.fields.find((x) => x.name === id));
    if (kind === 'source' && !extra.create) draft = clone(D.sources.find((x) => x.id === id));
    if (extra.create) draft = extra.draft;
    ui.drawer = { kind, id, returnFid, create: !!extra.create, draft, orig: draft ? JSON.stringify(extra.dup ? (kind === 'field' ? f('', '', 0, 0, 'latest', 'default', [], {}) : { id: '' }) : draft) : '', orig_name: draft ? draft.name : '' };
    mountDrawer(false); renderPane(); updateSaveState();
    live(`${ui.drawer.kind === 'runs' ? 'Run history' : ui.drawer.create ? 'Add ' + kind : 'Edit ' + kind + ' ' + ui.drawer.orig_name} panel opened`);
  };
  if (ui.drawer) guard(() => { closeDrawerNow(true); run(); }); else run();
}
function focusTitle() { const t = $('#dr-title'); if (t) t.focus({ preventScroll: true }); }
function mountDrawer(silent) {
  const o = editorModel(); const d = $('#drawer'); d.hidden = false;
  d.innerHTML = `<div class="drawer" role="dialog" aria-modal="false" aria-labelledby="dr-title"><div class="drawer-h"><h2 id="dr-title" tabindex="-1">${o.title}</h2><span data-unsaved-pill>${drawerDirty() ? '<span class="unsaved">Unsaved</span>' : ''}</span><button class="btn icon" type="button" data-act="closeDrawer" aria-label="Close editor (Esc)">${ico('x')}</button></div><div class="drawer-body">${o.body}</div>${o.footer}</div>`;
  $('#layout').classList.add('with-drawer');
  if (!silent) setTimeout(focusTitle, 0);
}
function closeDrawerNow(skipFocus) {
  const dr = ui.drawer; if (!dr) return; const rf = dr.returnFid;
  const done = () => {
    ui.drawer = null; const d = $('#drawer'); if (d) { d.hidden = true; d.innerHTML = ''; }
    renderPane(); updateSaveState();
    if (!skipFocus) { const t = rf && $(`[data-fid="${CSS.escape(rf)}"]`); (t || $('#panel')).focus(); }
  };
  const el = $('.drawer'); if (el && !reduced() && !skipFocus) { el.classList.add('out'); setTimeout(done, 170); } else done();
}
const requestClose = () => guard(() => closeDrawerNow());
const editorModel = () => ({ field: fieldModel, source: sourceModel, runs: runsModel })[ui.drawer.kind]();
function fieldModel() {
  const dr = ui.drawer; const x = dr.draft;
  const body = `
    <fieldset class="sec"><legend>Identity</legend>
      ${textField('fd-name', 'name', 'Name', 'name', x.name, { mono: true, err: true })}
      ${textField('fd-desc', 'description', 'Description', 'desc', x.description, { optional: true })}
      ${switchRow('enabled', 'Enabled', 'fenabled', x.enabled !== false)}
      ${switchRow('key', 'Key field', 'key', x.key)}
    </fieldset>
    <fieldset class="sec"><legend>Merge</legend>
      ${selectField('fd-merge', 'merge', 'Method', 'merge', MERGE, x.merge)}
    </fieldset>
    <fieldset class="sec"><legend>Clean-up</legend>
      ${switchRow('cs', 'Case sensitive', 'cs', x.cs)}
      ${selectField('fd-norm', 'norm', 'Normalize', 'norm', NORMS, x.norm)}
      ${chipsField('ignore', 'Ignore values', 'ignore', x.ignore)}
      ${switchRow('inherit', 'Use the global ignore list', 'inherit', x.inherit)}
    </fieldset>
    <details class="adv" id="sec-adv" ${ui.advOpen ? 'open' : ''}><summary>Advanced</summary><div class="adv-in">
      ${selectField('fd-val', 'validation', 'Validation', 'validation', ['none', 'ipv4', 'mac', 'hostname', 'number'], x.validation)}
      ${segField('valueType', 'Value type', 'vtype', [['string', 'Text'], ['number', 'Number']], x.valueType)}
      ${numberField('fd-mv', 'maxValues', 'Max values kept', 'maxvals', x.maxValues, { min: 1, max: 100 })}
      ${switchRow('keepCase', 'Keep original case', 'keepcase', x.keepCase)}
      ${switchRow('track', 'Flag conflicts', 'track', x.track)}
      ${chipsField('allowed', 'Only accept values from', 'allowed', x.allowed)}
    </div></details>`;
  return { title: dr.create ? 'Add field' : `Edit field <span class="mono">${esc(dr.orig_name)}</span>`, body, footer: footerHtml('field') };
}
function sourceModel() {
  const dr = ui.drawer; const s = dr.draft; const create = dr.create;
  const cat = s.lookup ? CATALOG.find((c) => c.name === s.lookup) : null; const cols = cat ? cat.cols : [];
  const missing = !create && s.lookup && !cat; const showForm = s.lookup && (cols.length || missing);
  const pick = create ? `<fieldset class="sec"><legend>Lookup</legend><div>${labelRow('pick', 'Lookup', 'lookup')}<div class="combo"><input class="inp" id="pick" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pick-list" aria-describedby="pick-e" placeholder="Search by name or app" value="${esc(s.lookup)}" data-fid="pick" autocomplete="off"><div class="listbox" id="pick-list" role="listbox" hidden></div></div><div class="err" id="pick-e" role="alert" ${s.lookup && !cols.length ? '' : 'hidden'}>${s.lookup && !cols.length ? `${ico('alert')}<span>No columns found in “${esc(s.lookup)}”. Check that it has a header row and that this app can read it.</span>` : ''}</div></div>
    ${showForm ? `<details class="adv" open><summary>Columns found (${cols.length})</summary><div class="adv-in"><div class="schema-wrap"><table class="schema"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${cat.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details>` : ''}</fieldset>` : '';
  const body = pick + (missing ? `<div class="err" role="alert">${ico('alert')}<span>The lookup “${esc(s.lookup)}” no longer exists. Pick another lookup by removing this source and adding a new one.</span></div>` : '') + (showForm ? `
    <fieldset class="sec"><legend>Source</legend>
      ${textField('sd-name', 'name', 'Name', 'sname', s.name, { mono: true, err: true })}
      ${switchRow('enabled', 'Enabled', 'enabled', s.enabled)}
      ${segField('role', 'Role', 'role', [['auth', 'Authoritative'], ['enrich', 'Enrich only']], s.role)}
    </fieldset>
    <fieldset class="sec"><legend>Rows</legend>
      ${selectField('sd-time', 'timeCol', 'Timestamp column', 'ts', ['_time', ...cols], s.timeCol)}
      <div>${labelRow('sd-age', 'Max row age', 'age')}<div class="w-num"><div class="compound"><input class="inp" type="number" id="sd-age" min="0" value="${s.age}" data-d="age" data-fid="sd-age"><select class="inp" aria-label="Unit" data-d="ageUnit"><option value="d" ${s.ageUnit === 'd' ? 'selected' : ''}>days</option><option value="h" ${s.ageUnit === 'h' ? 'selected' : ''}>hours</option></select></div></div></div>
      ${textField('sd-filter', 'filter', 'Row filter', 'filter', s.filter, { mono: true, optional: true, ph: 'severity>=3', err: true })}
      ${textField('sd-scope', 'scope', 'Scope value', 'scope', s.scope, { optional: true })}
    </fieldset>
    <fieldset class="sec"><legend>Field mapping</legend>
      <div>${labelRow('map-0', 'Lookup column → asset field', 'mapping')}
      <div style="display:grid;gap:8px">${s.map.map((m, i) => `<div class="mapline"><select class="inp" aria-label="Lookup column ${i + 1}" data-dm="from" data-i="${i}">${cols.map((c) => `<option ${m.from === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><span aria-hidden="true" class="muted">→</span><input class="inp mono" aria-label="Asset field ${i + 1}" value="${esc(m.to)}" list="fld-list" data-dm="to" data-i="${i}" id="map-${i}"><button class="btn icon danger" type="button" data-act="mapDel" data-i="${i}" aria-label="Remove mapping ${i + 1}">${ico('x')}</button></div>`).join('')}<datalist id="fld-list">${D.fields.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></div></div>
      <div><button class="btn sm" type="button" data-act="mapAdd">${ico('plus')}Add mapping</button></div>
    </fieldset>` : '');
  return { title: create ? 'Add source' : `Edit source <span class="mono">${esc(dr.orig_name)}</span>`, body, footer: footerHtml('source') };
}
function runsModel() {
  const first = { t: ui.run.time, st: 'ok', out: ui.run.assets, d: ui.run.delta, dur: '2m 41s' };
  const rows = ui.run.status === 'never' ? [] : [first, ...(ui.run.time === 'Today 03:10' ? [] : [{ t: 'Today 03:10', st: 'ok', out: 41872, d: '+212', dur: '2m 41s' }]), ...RUNS];
  const body = `<fieldset class="sec"><legend>Runs</legend><table class="runs"><thead><tr><th>When</th><th>Result</th><th>Assets</th><th>Change</th><th>Took</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.t)}</td><td><span class="pill ${r.st === 'ok' ? 'ok' : 'warn'}">${r.st === 'ok' ? 'Succeeded' : 'Skipped'}</span></td><td>${r.out.toLocaleString()}</td><td>${esc(r.d)}</td><td>${esc(r.dur)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No runs yet.</td></tr>'}</tbody></table></fieldset>
    <fieldset class="sec"><legend>Needs review</legend><table class="runs"><thead><tr><th>Cluster</th><th>Keys</th><th>Sources</th></tr></thead><tbody><tr><td class="mono">gw-lobby, 10.4.0.1, …</td><td>31</td><td>dhcp_leases, crowdstrike_hosts</td></tr><tr><td class="mono">vdi-pool-07, …</td><td>18</td><td>ad_computers</td></tr></tbody></table></fieldset>
    <fieldset class="sec"><legend>Recent changes</legend><table class="runs"><thead><tr><th>Asset</th><th>Fields</th><th>When</th></tr></thead><tbody><tr><td class="mono">wks-0142</td><td>os, owner</td><td>Today 03:10</td></tr><tr><td class="mono">srv-db-07</td><td>ip</td><td>Today 03:10</td></tr><tr><td class="mono">printer-3f</td><td>(new)</td><td>Yesterday</td></tr></tbody></table></fieldset>`;
  return { title: 'Run history', body, footer: '<div class="drawer-f"><button class="btn" type="button" data-act="closeDrawer">Close</button></div>' };
}
function footerHtml(kind) {
  const dr = ui.drawer;
  return `<div class="drawer-f"><button class="btn primary" type="button" data-act="saveDrawer" data-fid="save" ${dr.create || drawerDirty() ? '' : 'disabled'}>${dr.create ? 'Add ' + kind : 'Save'}</button><button class="btn" type="button" data-act="closeDrawer">Cancel</button></div>`;
}
function syncSaveBtn() {
  const b = $('[data-act=saveDrawer]'); if (b && ui.drawer) { const dr = ui.drawer; b.disabled = ui.save === 'saving' || (!dr.create && !drawerDirty()); b.textContent = ui.save === 'saving' ? 'Saving…' : dr.create ? 'Add ' + dr.kind : 'Save'; }
  refreshSettingsBar();
}
function onDraftChange() {
  $$('[data-unsaved-pill]').forEach((p) => { p.innerHTML = drawerDirty() ? '<span class="unsaved">Unsaved</span>' : ''; });
  updateSaveState(); syncSaveBtn();
}

/* ---------- Save, remove, duplicate ---------- */
function nameError(n, orig) {
  if (!n) return 'Enter a name.';
  if (n.startsWith('_')) return 'Names cannot start with an underscore. Splunk treats those as internal fields.';
  if (!FIELD_NAME_RE.test(n)) return 'Use letters, digits and underscores, starting with a letter.';
  if (RESERVED.includes(n)) return `“${n}” is reserved: AssetDB creates that field itself.`;
  if (D.fields.some((x) => x.name === n && x.name !== orig)) return `A field named “${n}” already exists.`;
  return '';
}
const srcNameError = (n, id) => !n ? 'Enter a name.' : !/^[A-Za-z0-9_]+$/.test(n) ? 'Use letters, digits and underscores.' : D.sources.some((s) => s.name === n && s.id !== id) ? `A source named “${n}” already exists. Names must be unique.` : '';
function showErr(inputSel, errSel, err) { const i = $(inputSel); const e = $(errSel); if (!i || !e) return; i.setAttribute('aria-invalid', !!err); e.hidden = !err; e.innerHTML = err ? ico('alert') + `<span>${esc(err)}</span>` : ''; }
async function saveDrawer() {
  const dr = ui.drawer; if (!dr || !dr.draft || ui.save === 'saving') return;
  const x = dr.draft; ui.retry = saveDrawer; ui.banner = null; renderBanner();
  if (dr.kind === 'field') {
    const err = nameError(x.name.trim(), dr.create ? null : dr.orig_name); showErr('#fd-name', '#fd-name-e', err); if (err) { $('#fd-name').focus(); return; }
    x.name = x.name.trim();
    if (!await persist(x.name, () => { const c = clone(x); if (dr.create) D.fields.push(c); else D.fields[D.fields.findIndex((q) => q.name === dr.id)] = c; })) return;
    toast(`Saved field “${x.name}”.`); finishSave(`fld-${x.name}`, x.name);
  } else {
    const err = srcNameError(x.name.trim(), x.id); showErr('#sd-name', '#sd-name-e', err); if (err) { $('#sd-name').focus(); return; }
    if ($('#sd-filter') && $('#sd-filter').getAttribute('aria-invalid') === 'true') { $('#sd-filter').focus(); return; }
    x.name = x.name.trim();
    if (!await persist(x.name, () => { const c = clone(x); if (dr.create) D.sources.push(c); else D.sources[D.sources.findIndex((q) => q.id === dr.id)] = c; })) return;
    toast(`Saved source “${x.name}”.`); finishSave(`src-${x.id}`, x.id);
  }
}
function finishSave(fidv, key) {
  ui.drawer.orig = JSON.stringify(ui.drawer.draft); ui.drawer.returnFid = fidv; closeDrawerNow(true); renderHeader();
  setTimeout(() => { refocus(fidv); const r = $(`tr[data-id="${CSS.escape(key)}"]`); if (r) r.classList.add('flash'); }, 0);
}
async function toggleRow(kind, id) {
  const item = kind === 'field' ? D.fields.find((q) => q.name === id) : D.sources.find((q) => q.id === id); if (!item) return;
  const on = !(kind === 'field' ? item.enabled !== false : item.enabled);
  ui.retry = () => toggleRow(kind, id);
  if (!await persist(`${on ? 'enable' : 'disable'} ${item.name}`, () => { item.enabled = on; })) return;
  renderPane(); renderHeader(); toast(`${on ? 'Enabled' : 'Disabled'} ${kind} “${item.name}”.`); setTimeout(() => refocus(`en-${kind}-${id}`), 0);
}
function askRemove(kind, id) {
  const isF = kind === 'field'; const item = isF ? D.fields.find((q) => q.name === id) : D.sources.find((q) => q.id === id); const name = item.name;
  const dep = isF ? [] : D.fields.filter((x) => x.allowed.includes(name));
  openModal({ title: `Remove ${kind} “${name}”?`, confirm: `Remove ${kind}`, cancel: 'Cancel', destructive: true,
    body: isF ? 'It will no longer be matched or merged. This is saved immediately and cannot be undone, but you can add the field again.' : `It will no longer be merged.${dep.length ? ` ${dep.length} field${dep.length > 1 ? 's only accept' : ' only accepts'} values from it (<strong>${dep.map((d) => esc(d.name)).join(', ')}</strong>); they keep that restriction but nothing will match it.` : ''} This is saved immediately and cannot be undone, but you can add the source again.`,
    onConfirm: async () => { ui.retry = null; if (!await persist(`remove ${name}`, () => { if (isF) D.fields = D.fields.filter((q) => q !== item); else D.sources = D.sources.filter((q) => q !== item); })) return;
      if (ui.drawer && ui.drawer.id === id) { ui.drawer.orig = JSON.stringify(ui.drawer.draft); closeDrawerNow(true); } else renderPane();
      renderHeader(); toast(`Removed ${kind} “${name}”.`); setTimeout(() => ($('.tbl .btn.sm') || $('#panel')).focus(), 0); } });
}
function dupRow(kind, id) {
  const src = kind === 'field' ? D.fields.find((q) => q.name === id) : D.sources.find((q) => q.id === id);
  const c = clone(src); c.name = src.name + '_copy'; if (kind === 'field') c.key = false; else c.id = 's' + Date.now();
  openDrawer(kind, null, `${kind === 'field' ? 'fld' : 'src'}-${id}`, { create: true, draft: c, dup: true });
}
function addCimPreset() {
  const add = [f('src_ip', 'Source IP address', 0, 0, 'latest', 'ip', [], {}), f('dest', 'Destination host', 0, 0, 'latest', 'hostname', [], {}), f('category', 'Asset category', 0, 0, 'coalesce', 'default', [], {})].filter((x) => !D.fields.some((q) => q.name === x.name));
  openModal({ title: 'Add CIM asset fields?', body: `These ${add.length} fields will be added:<ul>${add.map((x) => `<li><strong>${x.name}</strong>, ${esc(x.description)}</li>`).join('')}</ul>`, confirm: `Add ${add.length} fields`, cancel: 'Cancel',
    onConfirm: async () => { ui.retry = null; if (await persist('CIM preset', () => { D.fields.push(...add); })) { renderPane(); renderHeader(); toast(`Added ${add.length} CIM fields.`); } } });
}
async function saveSettings() {
  let bad = null;
  $$('[data-s]').forEach((i) => { const v = +i.value; const isBad = !Number.isInteger(v) || v < +i.dataset.min || v > +i.dataset.max; showErr(`#${i.id}`, `#${i.id}-e`, isBad ? `Enter a whole number from ${i.dataset.min} to ${i.dataset.max}.` : ''); if (isBad && !bad) bad = i; });
  if (bad) { bad.focus(); return; }
  ui.retry = saveSettings; const draft = clone(ui.sdraft);
  if (!await persist('settings', () => { D.settings = draft; })) return;
  ui.sdraft = clone(D.settings); renderPane(); updateSaveState(); toast('Saved settings.');
}
async function runNow() {
  if (ui.running) return; ui.running = true; renderHeader(); live('Merging started');
  await wait(reduced() ? 100 : 1900); ui.running = false;
  const first = ui.run.status === 'never'; const add = 31;
  ui.run = { time: 'Just now', status: 'ok', assets: first ? 41840 + add : (ui.run.assets || 41872) + add, delta: first ? '+' + (41840 + add).toLocaleString() : '+' + add };
  renderHeader(); renderPane(); toast(`Run finished: ${ui.run.assets.toLocaleString()} assets (${ui.run.delta}).`); live('Run finished');
}

/* ---------- Modal ---------- */
let modalState = null;
function openModal({ title, body, confirm, cancel = 'Cancel', destructive, onConfirm }) {
  const sc = document.createElement('div'); sc.className = 'scrim';
  sc.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-b"><h2 id="m-t">${esc(title)}</h2><div id="m-b" class="muted">${body}</div><div class="actions"><button class="btn" type="button" data-m="cancel">${esc(cancel)}</button><button class="btn ${destructive ? 'destructive' : 'primary'}" type="button" data-m="ok">${esc(confirm)}</button></div></div>`;
  document.body.append(sc); const prevActive = document.activeElement; modalState = { sc, prevActive };
  $('#hdr').inert = true; $('#main').inert = true; $('[data-m=cancel]', sc).focus();
  sc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
    if (e.key === 'Tab') { const bs = $$('button', sc); const i = bs.indexOf(document.activeElement); if (e.shiftKey && i === 0) { e.preventDefault(); bs[bs.length - 1].focus(); } else if (!e.shiftKey && i === bs.length - 1) { e.preventDefault(); bs[0].focus(); } }
  });
  sc.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (e.target === sc || (m && m.dataset.m === 'cancel')) closeModal(); else if (m) { closeModal(true); onConfirm(); } });
}
function closeModal(skipFocus) {
  if (!modalState) return; const { sc, prevActive } = modalState; sc.remove(); modalState = null; $('#hdr').inert = false; $('#main').inert = false;
  if (!skipFocus && prevActive && prevActive.isConnected) prevActive.focus();
}

/* ---------- Tooltips (fixed position so they are never clipped by the scrolling editor) ---------- */
function showTip(b) {
  const tp = b.closest('.tip'); const t = $('.tip-t', tp); $$('.tip.on').forEach((x) => x !== tp && x.classList.remove('on'));
  tp.classList.add('on'); const r = b.getBoundingClientRect(); const h = t.offsetHeight;
  t.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - 268)) + 'px'; t.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
}
const hideTips = () => $$('.tip.on').forEach((x) => x.classList.remove('on'));
document.addEventListener('mouseover', (e) => { const b = e.target.closest('.tip-b'); if (b) showTip(b); });
document.addEventListener('mouseout', (e) => { if (e.target.closest('.tip-b')) hideTips(); });
document.addEventListener('focusin', (e) => { const b = e.target.closest('.tip-b'); if (b) showTip(b); });
document.addEventListener('focusout', (e) => { if (e.target.closest('.tip-b')) hideTips(); });
document.addEventListener('scroll', hideTips, true);

/* ---------- Events ---------- */
function switchTab(id) { guard(() => { if (ui.drawer) closeDrawerNow(true); ui.tab = id; ui.sdraft = null; renderHeader(); renderMain(); }); }
document.addEventListener('click', (e) => {
  if (!e.target.closest('.mk')) { ui.clicks++; $('#mk-clicks').textContent = ui.clicks; }
  const tab = e.target.closest('[data-tab]'); if (tab) { if (tab.dataset.tab !== ui.tab) switchTab(tab.dataset.tab); return; }
  const del = e.target.closest('[data-chip-del]');
  if (del) { const id = del.dataset.chipDel; const arr = chipArr(id); const v = arr[+del.dataset.i]; del.closest('.chip').classList.add('out'); setTimeout(() => { arr.splice(+del.dataset.i, 1); refreshChips(id); live(`Removed ${v}`); }, reduced() ? 0 : 100); return; }
  const a = e.target.closest('[data-act]');
  if (!a) { const tr = e.target.closest('tr[data-open]'); if (tr && !e.target.closest('input,select,button,a')) { const b = $('[data-act=editField],[data-act=editSource]', tr); if (b) { ui.clicks--; b.click(); } } return; }
  const act = a.dataset.act; const id = a.dataset.id;
  if (a.tagName === 'A') e.preventDefault();
  const fns = {
    openPreview: () => toast(`Mockup: opens /app/search/search?sid=${ui.previewSid} in a new window.`),
    openSearch: () => toast('Mockup: this opens the Search app in a new tab.'),
    runs: () => { if (!(ui.drawer && ui.drawer.kind === 'runs')) openDrawer('runs', null, 'status'); },
    run: runNow,
    addSource: () => openDrawer('source', null, 'add-source', { create: true, draft: { id: 's' + Date.now(), name: '', lookup: '', app: '', enabled: true, role: 'auth', scope: '', age: 0, ageUnit: 'd', timeCol: '_time', filter: '', map: [], rows: 0 } }),
    editSource: () => openDrawer('source', id, `src-${id}`),
    addField: () => openDrawer('field', null, 'add-field', { create: true, draft: f('', '', 0, 0, 'latest', 'default', [], {}) }),
    editField: () => openDrawer('field', id, `fld-${id}`),
    toggleRow: () => toggleRow(a.dataset.kind, id),
    dupRow: () => dupRow(a.dataset.kind, id), rmRow: () => askRemove(a.dataset.kind, id),
    clearFilter: () => { ui.filter = ''; renderPane(); },
    preset: addCimPreset, closeDrawer: requestClose, saveDrawer,
    dswitch: () => { const k = a.dataset.k; ui.drawer.draft[k] = !ui.drawer.draft[k]; a.setAttribute('aria-checked', ui.drawer.draft[k]); onDraftChange(); },
    sbool: () => { ui.sdraft[a.dataset.k] = !ui.sdraft[a.dataset.k]; renderPane(); refocus('st-hist'); updateSaveState(); },
    ssave: saveSettings,
    sdiscard: () => { ui.sdraft = clone(D.settings); renderPane(); updateSaveState(); toast('Discarded unsaved settings.'); },
    goto: () => switchTab(id),
    stage: () => { const i = +id; ui.expanded.has(i) ? ui.expanded.delete(i) : ui.expanded.add(i); renderPane(); refocus(`stage-${i}`); },
    expandAll: () => { STAGES.forEach((_, i) => ui.expanded.add(i)); renderPane(); },
    preview: async () => { ui.previewState = 'loading'; renderPane(); await wait(1300); ui.previewState = 'done'; ui.previewSid = 'adbpreview_' + Date.now().toString(36); ui.previewVals = { assets: 41872 + D.sources.filter((s) => s.enabled).length * 7, overflow: 2, nokey: 118, shared: 5 }; renderPane(); refocus('preview'); live('Preview finished'); },
    copy: () => { try { navigator.clipboard.writeText(buildSpl().map((l) => l.text).join('\n')); } catch (er) { /* clipboard unavailable */ } toast('Search copied.'); },
    mapAdd: () => { const cat = CATALOG.find((c) => c.name === ui.drawer.draft.lookup); ui.drawer.draft.map.push({ to: '', from: cat.cols[0] }); rerender(); },
    mapDel: () => { ui.drawer.draft.map.splice(+a.dataset.i, 1); rerender(); },
    retry: () => { ui.banner = null; renderBanner(); if (ui.retry) ui.retry(); },
    regen: async () => { ui.banner = null; renderBanner(); setSave('saving'); await wait(700); ui.searchStale = false; setSave('saved'); toast('Merge search regenerated.'); },
    sync: async () => { ui.banner = null; renderBanner(); setSave('saving'); await wait(600); setSave('saved'); toast('Field types synced.'); },
    dismissBanner: () => { ui.banner = null; renderBanner(); },
  };
  if (fns[act]) fns[act]();
});
function rerender() { const f0 = fid(); mountDrawer(true); refocus(f0); onDraftChange(); }

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'f-filter') { ui.filter = t.value; const pos = t.selectionStart; renderPane(); const n = $('#f-filter'); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (t.id === 'pick') { pickerInput(t); return; }
  if (t.dataset.d && ui.drawer && ui.drawer.draft) {
    const k = t.dataset.d; const v = t.type === 'number' ? +t.value : t.value; ui.drawer.draft[k] = v;
    if (k === 'name') { const s = t.value.trim(); if (ui.drawer.kind === 'field') showErr('#fd-name', '#fd-name-e', s ? nameError(s, ui.drawer.create ? null : ui.drawer.orig_name) : ''); else showErr('#sd-name', '#sd-name-e', s ? srcNameError(s, ui.drawer.draft.id) : ''); }
    if (k === 'filter') { const bal = (v.match(/\(/g) || []).length === (v.match(/\)/g) || []).length && (v.match(/"/g) || []).length % 2 === 0; showErr('#sd-filter', '#sd-filter-e', bal ? '' : 'Unbalanced quote or parenthesis. Example: severity>=3 AND status="open"'); }
    onDraftChange(); return;
  }
  if (t.dataset.dm && ui.drawer) { ui.drawer.draft.map[+t.dataset.i][t.dataset.dm] = t.value; onDraftChange(); return; }
  if (t.dataset.s && ui.sdraft) { ui.sdraft[t.dataset.s] = +t.value; showErr(`#${t.id}`, `#${t.id}-e`, ''); updateSaveState(); refreshSettingsBar(); }
});
document.addEventListener('toggle', (e) => { if (e.target.dataset && e.target.dataset.actToggle === 'raw') { e.target.open ? ui.expanded.add('raw') : ui.expanded.delete('raw'); } if (e.target.id === 'sec-adv') ui.advOpen = e.target.open; }, true);

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Escape' && $('.tip.on')) { hideTips(); e.stopPropagation(); return; }
  if (t.dataset && t.dataset.chipInput) {
    const id = t.dataset.chipInput; const arr = chipArr(id); const err = $(`[data-chip-err="${id}"]`);
    if ((e.key === 'Enter' || e.key === ',') && t.value.trim()) {
      e.preventDefault(); const v = t.value.trim(); const m = chipError(id, v);
      if (m) { err.hidden = false; err.innerHTML = ico('alert') + `<span>${esc(m)}</span>`; t.closest('.chips').setAttribute('aria-invalid', 'true'); return; }
      if (arr.includes(v)) { err.hidden = false; err.innerHTML = ico('alert') + `<span>“${esc(v)}” is already in the list.</span>`; return; }
      arr.push(v); refreshChips(id); live(`Added ${v}`);
    } else if (e.key === 'Enter') { e.preventDefault(); }
    else if (e.key === 'Backspace' && !t.value && arr.length) { e.preventDefault(); const v = arr.pop(); refreshChips(id); live(`Removed ${v}`); }
    else if (e.key === 'Escape' && t.value) { t.value = ''; err.hidden = true; t.closest('.chips').removeAttribute('aria-invalid'); e.stopPropagation(); return; }
    else if (e.key !== 'Escape') return;
  }
  if (t.getAttribute && t.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    const tabs = $$('[role=tab]'); let i = tabs.indexOf(t); i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); const id = tabs[i].dataset.tab; switchTab(id); setTimeout(() => { const n = $(`#tab-${id}`); if (n) n.focus(); }, 30); return;
  }
  if (t.id === 'pick') { pickerKey(e, t); if (e.defaultPrevented) return; }
  if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey) && ui.drawer && ui.drawer.draft) { e.preventDefault(); saveDrawer(); return; }
  if (e.key === 'Escape') { if (modalState) return; if (ui.drawer) { e.preventDefault(); requestClose(); } return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey || modalState) return;
  if (e.key === '/' && ui.tab === 'fields' && !ui.drawer) { e.preventDefault(); const fl = $('#f-filter'); if (fl) fl.focus(); }
  if (e.key === 'n' && !ui.drawer) { e.preventDefault(); const b = ui.tab === 'fields' ? $('[data-act=addField]') : ui.tab === 'sources' ? $('[data-act=addSource]') : null; if (b) b.click(); }
});

/* source picker (combobox) */
let pickIdx = -1;
function pickerInput(t) {
  const q = t.value.toLowerCase(); const lb = $('#pick-list');
  const items = CATALOG.filter((c) => !D.sources.some((s) => s.lookup === c.name) && (c.name.includes(q) || c.app.toLowerCase().includes(q)));
  lb.innerHTML = items.length ? items.map((c, i) => `<div class="opt" role="option" id="po-${i}" data-lk="${c.name}" aria-selected="false"><span>${esc(c.name)}</span><small>${esc(c.app)}</small></div>`).join('') : '<div class="opt muted" role="option" aria-disabled="true">No lookups match</div>';
  lb.hidden = false; t.setAttribute('aria-expanded', 'true'); pickIdx = -1;
  lb.onmousedown = (ev) => { const o = ev.target.closest('[data-lk]'); if (o) { ev.preventDefault(); chooseLookup(o.dataset.lk); } };
}
function pickerKey(e, t) {
  const lb = $('#pick-list'); const opts = $$('[data-lk]', lb);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (lb.hidden) pickerInput(t); const o = $$('[data-lk]', lb); if (!o.length) return; pickIdx = (pickIdx + (e.key === 'ArrowDown' ? 1 : -1) + o.length) % o.length; o.forEach((x, i) => x.setAttribute('aria-selected', i === pickIdx)); t.setAttribute('aria-activedescendant', o[pickIdx].id); o[pickIdx].scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter' && pickIdx >= 0 && opts[pickIdx]) { e.preventDefault(); chooseLookup(opts[pickIdx].dataset.lk); }
  else if (e.key === 'Escape' && !lb.hidden) { e.preventDefault(); e.stopPropagation(); lb.hidden = true; t.setAttribute('aria-expanded', 'false'); }
}
function chooseLookup(name) {
  const c = CATALOG.find((q) => q.name === name); const s = ui.drawer.draft;
  s.lookup = name; s.app = c.app; s.name = name.replace(/ .*/, ''); s.rows = 1200 + Math.round(Math.random() * 9000);
  s.map = c.cols.filter((col) => D.fields.some((x) => x.name === col)).map((col) => ({ to: col, from: col }));
  rerender(); setTimeout(() => { const p = $('#pick'); if (p) p.focus(); }, 0); live(`${name} selected. ${c.cols.length ? c.cols.length + ' columns found' : 'No columns found'}`);
}
document.addEventListener('focusout', (e) => { if (e.target.id === 'pick') setTimeout(() => { const l = $('#pick-list'); if (l && document.activeElement !== e.target) l.hidden = true; }, 120); });
document.addEventListener('focusin', (e) => { if (e.target.id === 'pick' && !$('#pick').value) pickerInput(e.target); });

/* ---------- Mockup controls ---------- */
$('#mk-fail').addEventListener('change', (e) => { ui.failNext = e.target.value; });
$('#mk-theme').addEventListener('change', (e) => { if (e.target.value) document.documentElement.dataset.theme = e.target.value; else delete document.documentElement.dataset.theme; });
$('#mk-den').addEventListener('change', (e) => { if (e.target.value) document.documentElement.dataset.density = e.target.value; else delete document.documentElement.dataset.density; });
$('#mk-reset').addEventListener('click', (e) => { e.stopPropagation(); ui.clicks = 0; $('#mk-clicks').textContent = 0; });
$('#mk-scn').addEventListener('change', (e) => setScenario(e.target.value));
function setScenario(s) {
  ui.scenario = s; ui.drawer = null; ui.banner = null; ui.save = 'saved'; ui.searchStale = false; ui.sdraft = null;
  if (s === 'first') { D = initialData(); D.sources = []; D.fields = []; ui.run = { time: 'Never', status: 'never', assets: 0, delta: '+0' }; ui.tab = 'sources'; }
  else { D = initialData(); ui.run = { time: 'Today 03:10', status: 'ok', assets: 41872, delta: '+212' }; if (ui.tab === 'sources' && s === 'normal') ui.tab = 'fields'; }
  ui.prevSpl = []; renderHeader(); renderMain();
  if (s === 'loading') setTimeout(() => { $('#mk-scn').value = 'normal'; setScenario('normal'); }, 2600);
}
const q = new URLSearchParams(location.search);
if (q.get('theme')) { document.documentElement.dataset.theme = q.get('theme'); $('#mk-theme').value = q.get('theme'); }
if (q.get('mk') === '0') $('#mk').open = false;
$('#mk-scn').value = q.get('scenario') || 'normal';
if (q.get('tab')) ui.tab = q.get('tab');
setScenario($('#mk-scn').value);
if (q.get('tab')) { ui.tab = q.get('tab'); renderHeader(); renderMain(); }
window.__adb = { ui, D: () => D };
})();
