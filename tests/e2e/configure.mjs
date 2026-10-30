// Headless check: log in, open the Configure page, wait for the SPA mount point, fail on console errors.
import { chromium } from 'playwright';

const base = process.env.SPLUNK_WEB_URL;
const insecure = process.env.SPLUNK_INSECURE_TLS === '1';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: insecure });
const page = await ctx.newPage();
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
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('#ab_config', { timeout: 60000 });
// Splunk polls forever, so 'networkidle' never fires here; wait for the SPA to render instead.
await page.waitForSelector('#ab_config .lookups-table', { timeout: 60000 });
await page.screenshot({ path: process.env.E2E_SCREENSHOT || 'dist/e2e-configure.png' });
await browser.close();

if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('configure page OK');
