// Headless check: log in, open the Configure page, wait for the UI to render (it lives in a shadow root),
// fail on console errors, and check the Pipeline tab renders the generated search with locale prefixed links.
import { chromium } from 'playwright';
import { routeLocalAssets } from './local-assets.mjs';

const base = process.env.SPLUNK_WEB_URL;
const insecure = process.env.SPLUNK_INSECURE_TLS === '1';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: insecure });
const page = await ctx.newPage();
await routeLocalAssets(page);
// Failed requests are judged by URL below (Splunk itself 402s/404s some endpoints, e.g. on a free license)
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && /\/static\/app\/assetdb|conf-assetdb|conf-transforms\/assetdb|assetdb-lookupgen/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => errors.push(String(e)));

// Splunk Free has no authentication, so the login form never renders; log in only when it does.
await page.goto(`${base}/en-US/account/login`, { waitUntil: 'networkidle' });
if (await page.locator('input[name=username]').count()) {
  await page.fill('input[name=username]', process.env.SPLUNK_USER);
  await page.fill('input[name=password]', process.env.SPLUNK_PASSWORD);
  await page.click('input[type=submit], button[type=submit]');
  await page.waitForLoadState('networkidle');
}
// Splunk Web caches app static files for a year per build; bump so the freshly deployed JS/CSS is served.
await page.goto(`${base}/en-US/app/assetdb/configure`);
const csrf = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
if (csrf) {
  await ctx.request.post(`${base}/en-US/_bump`, { headers: { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' }, form: { splunk_form_key: csrf.value } });
}
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('#ab_config', { timeout: 60000 });
// Playwright pierces open shadow roots, so plain selectors find the page's elements.
await page.waitForSelector('.tab[data-tab="sources"]', { timeout: 60000 });
const stylesApplied = await page.evaluate(() => !!document.querySelector('#ab_config').shadowRoot.querySelector('link[rel=stylesheet]'));
if (!stylesApplied) errors.push('the stylesheet is not attached to the Configure page');
const theme = await page.getAttribute('#ab_config', 'data-theme');
if (!['light', 'dark'].includes(theme)) errors.push(`theme was not detected: ${theme}`);
// Pipeline: the generated search is listed stage by stage, links are built with the locale/root_endpoint prefix
await page.click('.tab[data-tab="pipeline"]');
await page.waitForSelector('.stage', { timeout: 30000 });
const stageCount = await page.locator('.stage').count();
if (stageCount < 3) errors.push(`expected the generated search in stages, found ${stageCount}`);
await page.click('summary:has-text("Raw search")');
const href = await page.getAttribute('a:has-text("Open in Search") >> nth=-1', 'href');
if (!/^\/[a-z]{2}-[A-Z]{2}\/app\/assetdb\/search\?/.test(href)) errors.push(`Open in Search link is not locale prefixed: ${href}`);
// Settings render with the saved values
await page.click('.tab[data-tab="settings"]');
await page.waitForSelector('#st-max_keys');
if (!/^\d+$/.test(await page.inputValue('#st-max_keys'))) errors.push('Max keys is not shown');
await page.screenshot({ path: 'dist/e2e-configure.png' }).catch(() => {});
await browser.close();
if (errors.length) { console.error('FAILED:\n' + errors.join('\n')); process.exit(1); }
console.log('Configure page OK');
