// Regenerates the README screenshots in docs/img/. Read only: the configuration the page reads is extended in flight
// (nothing is saved) so the tables show a realistic set of sources and fields built on the demo lookup's columns.
// Usage: E2E_LOCAL_ASSETS=1 SPLUNK_WEB_URL=... SPLUNK_USER=... node tests/e2e/screenshots.mjs
import { chromium } from 'playwright';
import { routeLocalAssets } from './local-assets.mjs';

const base = process.env.SPLUNK_WEB_URL;
const OUT = 'docs/img';
let minimal = false; // the CIM dialog is shown with only two fields configured, so it lists the rest
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: process.env.SPLUNK_INSECURE_TLS === '1', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await routeLocalAssets(page);

await page.route(/\/configs\/conf-assetdb(\?|$)/, async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const res = await route.fetch(); const body = await res.json();
  body.entry = body.entry.filter((e) => e.name === 'general');
  const general = body.entry[0];
  general.content.lookups = JSON.stringify([{ name: 'demo_assets', lookup: 'assetdb_demo_assets.csv' }, { name: 'demo_assets_enrich', lookup: 'assetdb_demo_assets.csv', role: 'enrich', max_age: '30d', enabled: '0' }]);
  const f = (name, c) => ({ name, content: Object.assign({}, c), acl: {} });
  body.entry.push(
    f('mac', { key_field: '1', normalizer: 'mac', validation_type: 'mac', description: 'MAC address of the asset' }),
    f('ip', { key_field: '1', key_scope: 'scoped', field_type: 'multivalue', normalizer: 'ip', validation_type: 'ip', description: 'IP addresses seen for the asset' }),
    ...(minimal ? [] : [
    f('nt_host', { key_field: '1', normalizer: 'hostname', description: 'Short host name' }),
    f('dns', { key_field: '1', normalizer: 'fqdn', description: 'Fully qualified domain name' }),
    f('owner', { description: 'Person or team that owns the asset', track_conflicts: '1' }),
    f('priority', { description: 'Business priority, 1 (low) to 5 (high)', merge_method: 'max', value_type: 'number' }),
    f('bunit', { description: 'Business unit' }),
    f('category', { field_type: 'multivalue', description: 'Categories, such as server or desktop' }),
    f('city', { description: 'City where the asset is located' }),
    f('country', { description: 'Country where the asset is located' })]));
  await route.fulfill({ response: res, json: body });
});

await page.goto(`${base}/en-US/account/login`, { waitUntil: 'networkidle' });
if (await page.locator('input[name=username]').count()) {
  await page.fill('input[name=username]', process.env.SPLUNK_USER); await page.fill('input[name=password]', process.env.SPLUNK_PASSWORD);
  await page.click('input[type=submit], button[type=submit]'); await page.waitForLoadState('networkidle');
}
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('.tab[data-tab="sources"]', { timeout: 60000 });
await page.waitForTimeout(2500);

// the app region only (no Splunk header), at most `maxH` tall
const shot = async (name, maxH = 760, tall = false) => {
  await page.waitForTimeout(400);
  const box = await page.locator('#hdr').boundingBox();
  const main = await page.locator('#main').boundingBox();
  const top = Math.max(0, box.y - 4); const h = tall ? maxH : Math.min(maxH, main.y + main.height - top);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: Math.max(0, box.x - 8), y: top + (await page.evaluate(() => window.scrollY)) * 0, width: Math.min(1440 - Math.max(0, box.x - 8), box.width + 16), height: h } });
  console.log('wrote', name);
};
const top = () => page.evaluate(() => window.scrollTo(0, 0));

await page.click('.tab[data-tab="sources"]'); await top(); await shot('sources', 420);
await page.click('.tab[data-tab="fields"]'); await top(); await shot('fields', 700);

// field editor with a tooltip showing
await page.locator('tbody tr', { hasText: 'priority' }).locator('[data-act=editField]').click();
await page.waitForTimeout(400);
const adv = page.locator('details.adv summary').nth(1); if (await adv.count()) await adv.click();
await top(); await page.locator('.drawer .tip-b').nth(4).hover(); await shot('field-editor', 900);
await page.keyboard.press('Escape'); await page.mouse.move(2, 2);

// source editor
await page.click('.tab[data-tab="sources"]');
await page.locator('tbody tr', { hasText: 'demo_assets_enrich' }).locator('[data-act=editSource]').click();
await page.waitForTimeout(600); await top(); await shot('source-editor', 900);
await page.keyboard.press('Escape'); await page.mouse.move(2, 2);

// pipeline with a finished preview
await page.click('.tab[data-tab="pipeline"]'); await page.click('[data-act=preview]');
await page.waitForSelector('.diffgrid .kpi .v', { timeout: 180000 }); await top(); await shot('pipeline', 900);

await page.click('.tab[data-tab="settings"]'); await top(); await shot('settings', 900);

await page.locator('[data-act=runs]').first().click(); await page.waitForTimeout(1500); await top(); await shot('run-history', 900);

// CIM dialog, with only two fields configured so it lists the others
minimal = true;
await page.goto(`${base}/en-US/app/assetdb/configure`); await page.waitForSelector('.tab[data-tab="fields"]'); await page.waitForTimeout(2000);
await page.click('.tab[data-tab="fields"]'); await page.locator('[data-act=preset]').first().click(); await page.waitForTimeout(400);
await shot('cim-dialog', 760, true);
await browser.close();
