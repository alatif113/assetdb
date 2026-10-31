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
let originalLookups;
let originalFieldsList;
let originalMacro;
const presetNames = ['ip', 'mac', 'nt_host', 'dns', 'owner', 'priority', 'bunit', 'category', 'city', 'country', 'pci_domain', 'is_expected'];
let presetsAdded = false;
const generalConf = async () => (await conf()).find((e) => e.name === 'general').content;
const modal = () => page.locator('.modal:visible');

try {
  await page.goto(`${base}/en-US/app/assetdb/configure`);
  await page.waitForSelector('#ab_config .lookups-table', { timeout: 60000 });

  originalSearch = await savedSearch();
  originalLookups = (await generalConf()).lookups;
  originalFieldsList = await fieldsList();
  originalMacro = (await rest('/servicesNS/nobody/assetdb/data/macros/adb_enrich_outputs')).entry[0].content.definition;

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

  // Sources: edit options (max age, row filter, column mapping), see them stored and used by the saved search
  await page.click('#ab_config a.tab-label:has-text("Asset Lookups")');
  await page.click('#ab_config .adb-lookup-edit');
  await modal().waitFor();
  check((await modal().locator('.adb-source-schema').innerText()).length > 0, 'edit source shows the lookup schema box');
  await page.fill('.modal:visible #inputSourceMaxAge input', 'nonsense');
  await page.click('.modal:visible .btn-primary');
  check((await modal().locator('#inputSourceMaxAge .error-message').count()) > 0, 'invalid max age is rejected');
  await page.fill('.modal:visible #inputSourceMaxAge input', '45d');
  await page.fill('.modal:visible #inputSourceFilter input', 'priority>>0');
  await page.click('.modal:visible .btn-primary');
  await page.waitForTimeout(1500);
  check((await modal().locator('#inputSourceFilter .error-message').allInnerTexts()).some((t) => /malformed|unexpected/i.test(t)), 'invalid row filter is rejected with the parser message');
  await page.fill('.modal:visible #inputSourceFilter input', 'priority>0');
  await page.fill('.modal:visible #inputSourceScope input', 'E2E_Site');
  await page.fill('.modal:visible #inputSourceColumns', 'owner = Owner Name');
  await page.click('.modal:visible .btn-primary');
  await page.waitForTimeout(2500);
  const demo = JSON.parse((await generalConf()).lookups)[0];
  check(demo.max_age === '45d' && demo.filter === 'priority>0' && demo.columns.owner === 'Owner Name' && demo.enabled === true, 'source options stored in the lookups JSON');
  check((await savedSearch()).includes('relative_time(now(), "-45d")'), 'saved search applies the max age');
  check((await savedSearch()).includes('"e2e_site"') && (await savedSearch()).includes('| eval scope = lower(case('), 'saved search assigns the source scope');

  // CIM presets: one click adds the missing CIM fields (removed again by the cleanup below)
  await page.click('#ab_config a.tab-label:has-text("Asset Fields")');
  await page.click('#ab_config .btn-add-cim-fields');
  await modal().waitFor();
  check((await modal().innerText()).includes('nt_host'), 'the CIM dialog lists the fields it will add');
  presetsAdded = true;
  await page.click('.modal:visible .btn-primary');
  await page.waitForSelector('#ab_config tr[data-name="mac"]', { timeout: 60000 });
  const afterPresets = (await conf()).map((e) => e.name);
  check(presetNames.every((n) => afterPresets.includes(n)), 'all CIM fields were added to assetdb.conf');
  check((await savedSearch()).includes('`normalize_mac(mac)`'), 'saved search uses the preset normalizers');
  const accel = (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb')).entry[0].content;
  check(['ip', 'mac', 'nt_host', 'dns'].every((n) => accel[`accelerated_fields.${n}`]), 'the four CIM key fields are indexed');

  // Settings: max keys is validated against the hard cap, valid values are saved, and the original is restored
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
  check(Array.isArray(JSON.parse((await generalConf()).ignore_values || 'null')), 'global ignore list saved as a JSON array');
  check(JSON.parse((await generalConf()).key_blocklist || 'null')?.includes('00:00:00:00:00:00'), 'key blocklist saved (defaults shown and stored)');
  check((await generalConf()).max_key_share === '50', 'max key share saved');
  check((await savedSearch()).includes('adbmerge max_keys=30 max_key_share=50'), 'saved search passes max_key_share');
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

  // eval expressions are checked by Splunk's parser (the v2 parser endpoint needs POST)
  await page.fill('.modal:visible #inputEvalExp input', 'if(');
  await page.fill('.modal:visible #inputFillnull input', '');
  await page.click('.modal:visible #inputKeyField button[data-value="0"]');
  await page.click('.modal:visible .btn-primary');
  await page.waitForTimeout(1500);
  check((await modal().locator('#inputEvalExp .error-message').count()) > 0, 'a malformed eval expression is rejected by the parser');
  await page.fill('.modal:visible #inputEvalExp input', '');
  await page.click('.modal:visible #inputKeyField button[data-value="1"]');

  // add a key field with the new cleaning options
  await page.fill('.modal:visible #inputFillnull input', '').catch(() => {});
  await page.fill('.modal:visible #inputDescription input', 'e2e test field');
  await page.selectOption('.modal:visible #inputNormalizer select', 'trim');
  await page.click('.modal:visible #inputKeyScope button[data-value="scoped"]');
  await page.selectOption('.modal:visible #inputValidationType select', 'ipv4');
  check(await modal().locator('#inputKeepCase').isVisible(), 'Keep Original Case is offered for a case insensitive key field');
  await page.click('.modal:visible .btn-primary');
  await page.waitForSelector(`#ab_config tr[data-name="${name}"]`, { timeout: 30000 });
  check(true, 'new field appears in the table after the save chain completes');
  check((await conf()).some((e) => e.name === name), 'field stanza written to assetdb.conf');
  const saved = (await conf()).find((e) => e.name === name).content;
  check(saved.description === 'e2e test field' && saved.normalizer === 'trim' && saved.validation_type === 'ipv4', 'new field options are stored');
  check((await savedSearch()).includes(name), 'saved search regenerated with the new field');
  check((await savedSearch()).includes(`\`normalize_trim(${name})\``), 'saved search applies the normalizer');
  check((await savedSearch()).includes(`mvmap(adbk_${name}, scope`), 'saved search prefixes the scoped key');
  const collection = async () => (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb')).entry[0].content;
  check((await collection())[`accelerated_fields.${name}`] === JSON.stringify({ [name]: 1 }), 'key field is accelerated in the KV collection');
  const macro = async () => (await rest('/servicesNS/nobody/assetdb/data/macros/adb_enrich_outputs')).entry[0].content.definition;
  check((await macro()).includes(`${name} AS asset_${name}`), 'adb_enrich_outputs lists the new field');
  check((await fieldsList()).split(',').includes(name) && (await fieldsList()).includes('last_seen'), 'transforms fields_list updated (incl. last_seen)');

  // delete it again
  await page.click('#ab_config a.tab-label:has-text("Asset Fields")');
  await page.click(`#ab_config tr[data-name="${name}"] .adb-field-delete`);
  await modal().waitFor();
  await page.click('.modal:visible .btn-primary');
  await page.waitForSelector(`#ab_config tr[data-name="${name}"]`, { state: 'detached', timeout: 30000 });
  check(!(await conf()).some((e) => e.name === name), 'field stanza removed');
  check(!(await savedSearch()).includes(name), 'saved search no longer mentions the field');
  check(!(await collection())[`accelerated_fields.${name}`], 'acceleration removed with the field');
  check(!(await macro()).includes(`asset_${name}`), 'adb_enrich_outputs no longer lists the field');
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
  const csrfForCleanup = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
  if (presetsAdded && csrfForCleanup) {
    const hdr = { 'X-Splunk-Form-Key': csrfForCleanup.value, 'X-Requested-With': 'XMLHttpRequest' };
    const root = `${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb`;
    const present = (await conf().catch(() => [])).map((e) => e.name);
    for (const n of presetNames.filter((x) => present.includes(x))) await ctx.request.delete(`${root}/configs/conf-assetdb/${n}`, { headers: hdr }).catch(() => {});
    if (originalFieldsList !== undefined) await ctx.request.post(`${root}/configs/conf-transforms/assetdb`, { headers: hdr, form: { fields_list: originalFieldsList } }).catch(() => {});
    if (originalMacro !== undefined) await ctx.request.post(`${root}/data/macros/adb_enrich_outputs`, { headers: hdr, form: { definition: originalMacro } }).catch(() => {});
    // only clear settings that exist: blank entries for unknown names would count against the 10 index limit
    const current = (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb').catch(() => ({ entry: [{ content: {} }] }))).entry[0].content;
    const clear = {};
    for (const n of presetNames) for (const k of [`accelerated_fields.${n}`, `field.${n}`]) if (current[k]) clear[k] = '';
    if (Object.keys(clear).length) await ctx.request.post(`${root}/storage/collections/config/assetdb`, { headers: hdr, form: clear }).catch(() => {});
    const after = (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb').catch(() => ({ entry: [{ content: {} }] }))).entry[0].content;
    check(!(await conf().catch(() => [])).some((e) => presetNames.includes(e.name)) && presetNames.every((n) => !after[`accelerated_fields.${n}`] && !after[`field.${n}`]), 'CIM fields cleaned up (config and collection)');
  }
  // the UI regenerates the saved search on every change; put back what was there before
  const csrf = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
  if (originalSearch !== undefined && csrf) {
    if (originalLookups !== undefined) {
      await ctx.request.post(`${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb/configs/conf-assetdb/general`, {
        headers: { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' }, form: { lookups: originalLookups, output_mode: 'json' },
      }).catch(() => {});
      check((await generalConf().catch(() => ({}))).lookups === originalLookups, 'lookups config restored');
    }
    await ctx.request.post(`${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb/saved/searches/assetdb-lookupgen`, {
      headers: { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' }, form: { search: originalSearch, output_mode: 'json' },
    }).catch(() => {});
    check((await savedSearch().catch(() => null)) === originalSearch, 'saved search restored to its original text');
  }
  await page.screenshot({ path: 'dist/e2e-flow.png' }).catch(() => {});
  await browser.close();
}
if (errors.length) { console.error('FAILED:\n' + errors.join('\n')); process.exit(1); }
console.log('UI flow OK');
