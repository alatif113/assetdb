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
// Splunk Web caches app static files for a year per build; bump so the freshly deployed JS/CSS is served.
await page.goto(`${base}/en-US/app/assetdb/configure`);
const csrf = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
if (csrf) {
  await ctx.request.post(`${base}/en-US/_bump`, { headers: { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' }, form: { splunk_form_key: csrf.value } });
}
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('#ab_config', { timeout: 60000 });
// Splunk polls forever, so 'networkidle' never fires here; wait for the SPA to render instead.
await page.waitForSelector('#ab_config .lookups-table', { timeout: 60000 });
// Links must be built with the locale/root_endpoint prefix
await page.click('#ab_config a.tab-label:has-text("Asset Merge Search")');
const runHref = await page.getAttribute('#ab_config a:has-text("Run Search")', 'href');
const schedHref = await page.getAttribute('#ab_config a:has-text("Edit Schedule")', 'href');
if (!/^\/[a-z]{2}-[A-Z]{2}\/app\/assetdb\/search\?/.test(runHref)) errors.push(`Run Search link is not locale prefixed: ${runHref}`);
if (!/^\/[a-z]{2}-[A-Z]{2}\/manager\/assetdb\//.test(schedHref)) errors.push(`Edit Schedule link is not locale prefixed: ${schedHref}`);
// The merge search preview is rendered from typed lines: numbered rows with highlighted commands, no error box
const rows = await page.locator('#ab_config .formatted-query .row').count();
const keywords = await page.locator('#ab_config .formatted-query span.keyword').count();
const previewError = await page.locator('#ab_config .formatted-query .error-message').count();
if (rows < 5 || keywords < 2 || previewError) errors.push(`merge search preview not rendered (rows=${rows}, keywords=${keywords}, errors=${previewError})`);
await page.screenshot({ path: process.env.E2E_SCREENSHOT || 'dist/e2e-configure.png' });
await browser.close();

if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('configure page OK');
