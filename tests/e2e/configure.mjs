// Headless check: log in, open the Configure page, wait for the SPA mount point, fail on console errors.
import { chromium } from 'playwright';

const base = process.env.SPLUNK_WEB_URL;
const insecure = process.env.SPLUNK_INSECURE_TLS === '1';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: insecure });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/en-US/account/login`);
await page.fill('input[name=username]', process.env.SPLUNK_USER);
await page.fill('input[name=password]', process.env.SPLUNK_PASSWORD);
await page.click('input[type=submit], button[type=submit]');
await page.waitForLoadState('networkidle');
await page.goto(`${base}/en-US/app/assetdb/configure`);
await page.waitForSelector('#ab_config', { timeout: 60000 });
await page.waitForLoadState('networkidle');
await browser.close();

if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('configure page OK');
