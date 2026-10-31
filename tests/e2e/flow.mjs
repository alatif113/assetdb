// Live UI flow: reserved-name rejection, cancelled lookup removal, add field, delete field.
// Writes to the real assetdb.conf / saved search / transforms.conf and cleans up after itself.
import { chromium } from 'playwright';

const base = process.env.SPLUNK_WEB_URL;
const name = `adbtest_${Date.now().toString(36)}`;
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); console.log(cond ? 'ok  ' : 'FAIL', msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: process.env.SPLUNK_INSECURE_TLS === '1' });
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 1600 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));

const rest = async (path) => (await ctx.request.get(`${base}/en-US/splunkd/__raw${path}${path.includes('?') ? '&' : '?'}output_mode=json&count=0`)).json();
const conf = async () => (await rest('/servicesNS/nobody/assetdb/configs/conf-assetdb')).entry;
const savedSearch = async () => (await rest('/servicesNS/nobody/assetdb/saved/searches/assetdb-lookupgen')).entry[0].content.search;
const fieldsList = async () => (await rest('/servicesNS/nobody/assetdb/configs/conf-transforms/assetdb')).entry[0].content.fields_list;
let originalSearch;
const modal = () => page.locator('.modal:visible');

try {
  await page.goto(`${base}/en-US/app/assetdb/configure`);
  await page.waitForSelector('#ab_config .lookups-table', { timeout: 60000 });

  originalSearch = await savedSearch();

  // F-08: cancelling Remove Lookup must not change anything
  const lookupsBefore = (await conf()).find((e) => e.name === 'general').content.lookups;
  await page.click('#ab_config .adb-lookup-delete');
  await modal().waitFor();
  await page.click('.modal:visible a.btn:has-text("Cancel")');
  await page.waitForTimeout(800);
  await page.click('#ab_config .btn-add-lookup');
  await modal().waitFor();
  await page.click('.modal:visible a.btn:has-text("Cancel")');
  check((await conf()).find((e) => e.name === 'general').content.lookups === lookupsBefore, 'cancelled lookup removal leaves the lookups config unchanged');

  // Settings: max keys is validated against the hard cap, valid values are saved, and the original is restored
  const generalConf = async () => (await conf()).find((e) => e.name === 'general').content;
  const originalMaxKeys = (await generalConf()).max_keys;
  await page.click('#ab_config a.tab-label:has-text("Settings")');
  await page.fill('#inputMaxKeys input', '500');
  await page.click('#ab_config .btn-save-settings');
  check((await page.locator('#inputMaxKeys .error-message').count()) > 0, 'max keys above the hard cap is rejected');
  await page.fill('#inputMaxKeys input', '30');
  await page.click('#ab_config .btn-save-settings');
  await page.waitForSelector('#ab_config a.tab-label:has-text("Settings")');
  await page.waitForTimeout(1500);
  check((await generalConf()).max_keys === '30', 'max keys saved to the [general] stanza');
  check((await savedSearch()).includes('adbmerge max_keys=30'), 'saved search regenerated with the new max keys');
  await page.click('#ab_config a.tab-label:has-text("Settings")');
  await page.fill('#inputMaxKeys input', originalMaxKeys || '25');
  await page.click('#ab_config .btn-save-settings');
  await page.waitForTimeout(1500);

  // F-09: reserved field name is rejected
  await page.click('#ab_config a.tab-label:has-text("Asset Fields")');
  await page.click('#ab_config .btn-add-field');
  await modal().waitFor();
  check((await modal().locator('h3').innerText()) === 'Add Field', 'Add Field modal has the Add title');
  await page.fill('.modal:visible #inputFieldName input', 'general');
  await page.click('.modal:visible .btn-primary');
  check(await modal().locator('.error-message').count() > 0, 'reserved name "general" is rejected');
  check(!(await conf()).some((e) => e.name === 'general' && e.content.field_type), 'no field stanza created for "general"');

  // F-14: fill null on a key field is rejected
  await page.fill('.modal:visible #inputFieldName input', name);
  await page.click('.modal:visible #inputKeyField button[data-value="1"]');
  await page.fill('.modal:visible #inputFillnull input', 'x').catch(() => {});
  await page.click('.modal:visible .btn-primary');
  const fillnullErr = await modal().locator('.error-message').allInnerTexts();
  check(fillnullErr.some((t) => /key field/i.test(t)) || (await conf()).every((e) => e.name !== name), 'fill null on a key field is refused');

  // add a normal field
  await page.click('.modal:visible #inputKeyField button[data-value="0"]');
  await page.fill('.modal:visible #inputFillnull input', '').catch(() => {});
  await page.click('.modal:visible .btn-primary');
  await page.waitForSelector(`#ab_config tr[data-name="${name}"]`, { timeout: 30000 });
  check(true, 'new field appears in the table after the save chain completes');
  check((await conf()).some((e) => e.name === name), 'field stanza written to assetdb.conf');
  check((await savedSearch()).includes(name), 'saved search regenerated with the new field');
  check((await fieldsList()).split(',').includes(name) && (await fieldsList()).includes('last_seen'), 'transforms fields_list updated (incl. last_seen)');

  // delete it again
  await page.click('#ab_config a.tab-label:has-text("Asset Fields")');
  await page.click(`#ab_config tr[data-name="${name}"] .adb-field-delete`);
  await modal().waitFor();
  await page.click('.modal:visible .btn-primary');
  await page.waitForSelector(`#ab_config tr[data-name="${name}"]`, { state: 'detached', timeout: 30000 });
  check(!(await conf()).some((e) => e.name === name), 'field stanza removed');
  check(!(await savedSearch()).includes(name), 'saved search no longer mentions the field');
  check(!(await fieldsList()).split(',').includes(name), 'transforms fields_list no longer lists the field');
} catch (e) {
  errors.push(String(e));
} finally {
  // best-effort cleanup so a failed run does not leave the test field behind
  const stray = (await conf().catch(() => [])).some((e) => e.name === name);
  if (stray) {
    console.log(`cleaning up leftover field ${name}`);
    await ctx.request.delete(`${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb/configs/conf-assetdb/${name}`).catch(() => {});
  }
  // the UI regenerates the saved search on every change; put back what was there before
  const csrf = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
  if (originalSearch !== undefined && csrf) {
    const resp = await ctx.request.post(`${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb/saved/searches/assetdb-lookupgen`, {
      headers: { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' }, form: { search: originalSearch, output_mode: 'json' },
    }).catch((e) => ({ status: () => 0, text: async () => String(e) }));
    console.log('restore POST', resp.status(), (await resp.text()).slice(0, 150));
    check((await savedSearch().catch(() => null)) === originalSearch, 'saved search restored to its original text');
  }
  await page.screenshot({ path: 'dist/e2e-flow.png' }).catch(() => {});
  await browser.close();
}
if (errors.length) { console.error('FAILED:\n' + errors.join('\n')); process.exit(1); }
console.log('UI flow OK');
