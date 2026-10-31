// Visual sweep of the Configure page: every tab and the main overlays at three widths. It checks what a person would
// notice: tooltips that are cut off or off screen, text spilling out of its box, content wider than the page, controls
// overlapping each other. Screenshots go to dist/visual/ for a look. Read only: nothing is saved.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { routeLocalAssets } from './local-assets.mjs';

const base = process.env.SPLUNK_WEB_URL;
const insecure = process.env.SPLUNK_INSECURE_TLS === '1';
const issues = [];
fs.mkdirSync('dist/visual', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: insecure, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await routeLocalAssets(page);
page.on('pageerror', (e) => issues.push(`page error: ${e}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !/a_lookup_with_a_very_long_name/.test(m.text())) issues.push(`console: ${m.text()}`); });

// Nothing is saved by this sweep. The configuration the page reads is extended in flight with a realistic set of
// fields and sources (long names, a missing lookup, a disabled row, a field nobody supplies) so every table, flag and
// editor has something to show, whatever the server holds.
await page.route(/\/configs\/conf-assetdb(\?|$)/, async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const res = await route.fetch(); const body = await res.json();
  const general = body.entry.find((e) => e.name === 'general');
  const lookups = JSON.parse(general.content.lookups || '[]');
  lookups.push({ name: 'a_rather_long_source_name_for_wrapping', lookup: 'a_lookup_with_a_very_long_name_that_does_not_exist_anywhere.csv', role: 'enrich', scope: 'paris-datacenter', max_age: '30d' }, { name: 'disabled_source', lookup: 'assetdb_demo_assets.csv', enabled: '0' });
  general.content.lookups = JSON.stringify(lookups);
  const f = (name, c) => ({ name, content: Object.assign({ description: '' }, c), acl: {} });
  body.entry.push(
    f('mac', { key_field: '1', normalizer: 'mac', description: 'Hardware address, the primary key' }),
    f('ip', { key_field: '1', key_scope: 'scoped', field_type: 'multivalue', description: 'IP addresses seen for the asset' }),
    f('nt_host', { description: 'Short host name' }),
    f('owner', { description: 'Person or team that owns the asset, as recorded in the CMDB or reported by the source system' }),
    f('a_field_with_a_really_long_name_for_checking', { description: 'No enabled source supplies this field, so it will always be empty and the row shows a warning flag' }),
    f('retired', { enabled: '0', description: 'Switched off' }));
  await route.fulfill({ response: res, json: body });
});

await page.goto(`${base}/en-US/account/login`, { waitUntil: 'networkidle' });
if (await page.locator('input[name=username]').count()) {
  await page.fill('input[name=username]', process.env.SPLUNK_USER); await page.fill('input[name=password]', process.env.SPLUNK_PASSWORD);
  await page.click('input[type=submit], button[type=submit]'); await page.waitForLoadState('networkidle');
}
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('.tab[data-tab="sources"]', { timeout: 60000 });

// runs in the page: geometry checks inside the shadow root
const audit = (label) => page.evaluate((label) => {
  const root = document.querySelector('#ab_config').shadowRoot; const out = []; const vw = Math.round(root.host.getBoundingClientRect().right);
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${el.dataset && el.dataset.act ? `[${el.dataset.act}]` : ''} "${(el.textContent || '').trim().slice(0, 30)}"`;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || el.closest('.tip-t') || el.closest('.sr-only') || el.matches('.sr-only')) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.right > vw + 1 && !el.matches('.scrim') && ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1)) out.push(`off the right edge: ${name(el)} (${Math.round(r.right)} > ${vw})`);
    const clips = /hidden|clip/.test(cs.overflowX);
    if (clips && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && !el.matches('.panel, .tablewrap, pre, code') && el.children.length === 0) out.push(`text cut off: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    if (!clips && el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline') out.push(`text spills out: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !el.title && !el.dataset.tip && !el.closest('[title],[data-tip]')) out.push(`truncated without a way to read it: ${name(el)}`);
  }
  // controls that overlap each other
  const shown = (el) => { let r = el.getBoundingClientRect(); for (let a = el.parentElement; a && a !== root.host; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) { const q = a.getBoundingClientRect(); if (r.bottom <= q.top || r.top >= q.bottom || r.right <= q.left || r.left >= q.right) return false; } } return true; };
  const ctl = [...root.querySelectorAll('button, a[href], input, select, .switch, [role=switch]')].filter((el) => visible(el) && shown(el));
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const a = ctl[i]; const b = ctl[j]; if (a.contains(b) || b.contains(a) || a.closest('.drawer-f') || b.closest('.drawer-f')) continue; // the footer floats over scrolled content
    const p = a.getBoundingClientRect(); const q = b.getBoundingClientRect();
    const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left); const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (ox > 3 && oy > 3) out.push(`controls overlap: ${name(a)} and ${name(b)}`);
  }
  return out.map((m) => `[${label}] ${m}`);
}, label);

// hover every help/flag/icon tooltip and check the bubble
async function tooltips(label) {
  const targets = await page.locator('.tip-b, [data-tip]').elementHandles();
  let n = 0;
  for (const h of targets) {
    if (!(await h.isVisible())) continue;
    await h.scrollIntoViewIfNeeded().catch(() => {});
    try { await h.hover({ timeout: 1500 }); } catch (e) { continue; } // covered by an overlay: nothing to check
    const res = await h.evaluate((el) => {
      const root = el.getRootNode(); const vw = window.innerWidth; const vh = window.innerHeight;
      const t = el.closest('.tip') ? el.closest('.tip').querySelector('.tip-t') : root.querySelector('#gtip');
      if (!t) return 'no tooltip element';
      const cs = getComputedStyle(t); if (cs.visibility === 'hidden' || t.hidden) return 'tooltip did not show';
      const r = t.getBoundingClientRect(); const errs = [];
      if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) errs.push(`off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
      if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) errs.push(`text cut off (${t.scrollWidth}x${t.scrollHeight} in ${t.clientWidth}x${t.clientHeight})`);
      const b = el.getBoundingClientRect(); if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) errs.push('covers its own trigger');
      return errs.join('; ');
    });
    n++;
    if (res) issues.push(`[${label}] tooltip on ${await h.evaluate((e) => e.getAttribute('aria-label') || e.dataset.tip || e.textContent.slice(0, 20))}: ${res}`);
  }
  await page.mouse.move(2, 2);
  return n;
}

async function snap(label) {
  await page.waitForTimeout(350);
  issues.push(...await audit(label));
  const n = await tooltips(label);
  await page.screenshot({ path: `dist/visual/${label}.png` });
  console.log(`${label}: ${n} tooltips checked`);
}
const closeAll = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); const d = page.locator('[data-act=discardYes], [data-act=confirmDiscard]'); if (await d.count()) await d.first().click(); } };

for (const [w, h] of [[1440, 900], [1000, 800], [700, 800]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${base}/en-US/app/assetdb/configure`);
  await page.waitForSelector('.tab[data-tab="sources"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const W = `w${w}`;
  for (const tab of ['sources', 'fields']) {
    await page.click(`.tab[data-tab="${tab}"]`); await snap(`${W}-${tab}`);
    // first row's editor
    const edit = page.locator('tbody tr').first().locator('[data-act=editRow], button[aria-label^="Edit"]').first();
    if (await edit.count()) { try { await edit.click({ timeout: 4000 }); } catch (e) { issues.push(`[${W}-${tab}] first row's Edit button cannot be clicked: ${String(e).split('\n').find((l) => /intercepts/.test(l)) || e}`); await page.screenshot({ path: `dist/visual/${W}-${tab}-blocked.png` }); continue; } await page.waitForTimeout(300); const adv = page.locator('details.adv summary').first(); if (await adv.count()) await adv.click(); await snap(`${W}-${tab}-editor`); await closeAll(); }
  }
  await page.click('.tab[data-tab="fields"]');
  const preset = page.locator('[data-act=preset]').first(); if (await preset.count() && await preset.isVisible()) { await preset.click(); await snap(`${W}-cim-dialog`); await closeAll(); }
  await page.click('.tab[data-tab="pipeline"]'); await snap(`${W}-pipeline`);
  await page.click('[data-act=preview]'); await page.waitForSelector('.diffgrid', { timeout: 120000 }).catch(() => issues.push(`[${W}] preview did not finish`)); await snap(`${W}-pipeline-preview`);
  await page.click('.tab[data-tab="settings"]'); await snap(`${W}-settings`);
  const runs = page.locator('[data-act=runs]').first(); if (await runs.count()) { await runs.click(); await snap(`${W}-run-history`); await closeAll(); }
}
await browser.close();
const unique = [...new Set(issues)];
if (unique.length) { console.error(`${unique.length} issue(s):\n` + unique.join('\n')); process.exit(1); }
console.log('No visual issues found');
