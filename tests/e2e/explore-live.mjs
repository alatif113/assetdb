// Opens the Explorer and Coverage dashboards in a real Splunk, in the light and the dark theme, and exercises them.
// Usage: node tests/e2e/explore-live.mjs   (needs SPLUNK_WEB_URL, and SPLUNK_USER / SPLUNK_PASSWORD unless the server needs no login)
// Read only. The theme is chosen with ?theme=light|dark, which Splunk Web honours for the page, so nothing is saved to the user's settings.
import { launch } from './viz-harness.mjs';
import fs from 'node:fs';
const base = process.env.SPLUNK_WEB_URL, app = process.env.ADB_APP || 'assetdb';
fs.mkdirSync('dist/viz', { recursive: true });
const browser = await launch(); const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 1000 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/en-US/account/login`, { waitUntil: 'domcontentloaded' });
if (await page.locator('input[name=username]').count()) { await page.fill('input[name=username]', process.env.SPLUNK_USER); await page.fill('input[name=password]', process.env.SPLUNK_PASSWORD); await page.click('input[type=submit], button[type=submit]'); await page.waitForLoadState('load'); await page.waitForTimeout(3000); }
const frames = () => page.frames().filter((f) => f !== page.mainFrame());
const find = async (sel) => { for (const f of frames()) { if (await f.locator(sel).count().catch(() => 0)) return f; } return null; };
let failed = 0; const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failed++; };

for (const theme of ['light', 'dark']) {
  // ---- Explorer
  await page.goto(`${base}/en-US/app/${app}/assetdb_explorer?theme=${theme}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(14000);
  const ex = await find('.xp');
  check(!!ex, `explorer ${theme}: the visualization is on the page`);
  if (ex) {
    check(await ex.locator('.adb').getAttribute('data-theme') === theme, `explorer ${theme}: it follows the Splunk theme`);
    check(await ex.locator('.item').count() > 0, `explorer ${theme}: assets are listed`);
    if (theme === 'light') {
      await ex.locator('.item').nth(2).click(); await page.waitForTimeout(9000);
      check(await ex.locator('.fname').count() > 0, 'explorer: selecting an asset shows its fields');
      console.log('       fields with provenance:', await ex.locator('.frow.has-prov').count());
      await ex.fill('[data-q]', 'berlin_*'); await page.waitForTimeout(12000);
      console.log('       after search "berlin_*": count text:', (await ex.locator('[data-count]').innerText()).replace(/\s+/g, ' '));
    }
    await page.screenshot({ path: `dist/viz/live-explorer-${theme}.png`, fullPage: true });
  }
  // ---- Coverage
  await page.goto(`${base}/en-US/app/${app}/assetdb_coverage?theme=${theme}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(14000);
  const hm = await find('.hm .grid');
  check(!!hm, `coverage ${theme}: the heatmap is on the page`);
  if (hm) {
    check(await hm.locator('.adb').getAttribute('data-theme') === theme, `coverage ${theme}: it follows the Splunk theme`);
    console.log('       columns:', (await hm.locator('.hdr:not(.first) .nm').allInnerTexts()).join(','), '| rows', await hm.locator('.rowlbl').count());
    if (theme === 'light') {
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null), hm.locator('.cell').first().click()]);
      check(!!popup, 'coverage: a click opens a search in a new window');
      if (popup) { await popup.waitForLoadState('domcontentloaded'); check(/\/app\/search\/search/.test(popup.url()) && /inputlookup(%20|\+)assetdb/.test(popup.url()), 'coverage: the new window is a search of the assetdb lookup'); await popup.close(); }
    }
    await page.screenshot({ path: `dist/viz/live-coverage-${theme}.png`, fullPage: true });
  }
}
console.log('js errors:', errs.slice(0, 3));
await browser.close();
process.exit(failed ? 1 : 0);
