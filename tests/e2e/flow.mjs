// Live UI flow against the real config: add a field (validation, draft/save), edit it, disable it, duplicate it, remove it,
// add and remove the CIM presets, edit source options, change settings, run a preview. Cleans up after itself.
import { chromium } from 'playwright';
import { routeLocalAssets } from './local-assets.mjs';

const base = process.env.SPLUNK_WEB_URL;
const name = `adbtest_${Date.now().toString(36)}`;
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); console.log(cond ? 'ok  ' : 'FAIL', msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: process.env.SPLUNK_INSECURE_TLS === '1' });
const page = await ctx.newPage();
await routeLocalAssets(page);
await page.setViewportSize({ width: 1440, height: 1200 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));

const rest = async (path) => (await ctx.request.get(`${base}/en-US/splunkd/__raw${path}${path.includes('?') ? '&' : '?'}output_mode=json&count=0`)).json();
const conf = async () => (await rest('/servicesNS/nobody/assetdb/configs/conf-assetdb')).entry;
const savedSearch = async () => (await rest('/servicesNS/nobody/assetdb/saved/searches/assetdb-lookupgen')).entry[0].content;
const fieldsList = async () => (await rest('/servicesNS/nobody/assetdb/configs/conf-transforms/assetdb')).entry[0].content.fields_list;
const generalConf = async () => (await conf()).find((e) => e.name === 'general').content;
const fieldConf = async (n) => ((await conf()).find((e) => e.name === n) || {}).content;
const presetNames = ['ip', 'mac', 'nt_host', 'dns', 'owner', 'priority', 'bunit', 'category', 'city', 'country', 'pci_domain', 'is_expected'];
let originalSearch; let originalSched; let originalLookups; let originalFieldsList; let originalMacro; let originalGeneral; let presetsAdded = false;
const modal = () => page.locator('.modal');
const row = (n) => page.locator(`tr[data-id="${n}"]`);
const editorFocused = () => page.waitForFunction(() => document.querySelector('#ab_config').shadowRoot.activeElement?.id === 'dr-title', null, { timeout: 15000 });
const settled = () => page.waitForFunction(() => document.querySelector('#ab_config').shadowRoot.querySelector('.d-status')?.dataset.state === 'saved', null, { timeout: 60000 });

try {
  await page.goto(`${base}/en-US/app/assetdb/configure`);
  await page.waitForSelector('.tab[data-tab="fields"]', { timeout: 60000 });
  await settled();

  const ss = await savedSearch();
  originalSearch = ss.search; originalSched = { cron_schedule: ss.cron_schedule, enableSched: ss.enableSched };
  originalGeneral = await generalConf(); originalLookups = originalGeneral.lookups;
  const startFields = (await conf()).filter((e) => e.name !== 'general').map((e) => e.name);
  originalFieldsList = startFields.concat(['_key', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts']).join(',');
  originalMacro = ['_key AS asset_id', 'source AS asset_source', 'source_lookup AS asset_source_lookup', 'last_seen AS asset_last_seen'].concat(startFields.map((n) => `${n} AS asset_${n}`)).join(', ');

  // the editor is a draft: opening and editing writes nothing until Save; tables have no inputs besides the Enabled switch
  await page.click('[data-act=addField]');
  await page.waitForSelector('#fd-name');
  check(await page.evaluate(() => document.activeElement === document.querySelector('#ab_config') && document.querySelector('#ab_config').shadowRoot.activeElement?.id === 'dr-title'), 'the editor takes focus on its heading');
  await page.fill('#fd-name', 'general');
  await page.click('[data-act=saveDrawer]');
  check((await page.locator('#fd-name-e').innerText()).length > 0, 'reserved name "general" is rejected');
  check(!(await conf()).some((e) => e.name === 'general' && e.content.field_type), 'no field stanza created for "general"');

  // fill null on a key field is rejected; a malformed eval expression is rejected by the parser
  await page.fill('#fd-name', name);
  await page.click('#sw-key');
  await page.click('summary:has-text("Advanced")');
  await page.fill('#fd-fill', 'x');
  await page.click('[data-act=saveDrawer]');
  check(/key field/i.test(await page.locator('#fd-fill-e').innerText()), 'fill null on a key field is refused');
  await page.fill('#fd-fill', '');
  await page.fill('#fd-eval', 'if(');
  await page.click('[data-act=saveDrawer]');
  await page.waitForFunction(() => document.querySelector('#ab_config').shadowRoot.querySelector('#fd-eval-e')?.hidden === false, null, { timeout: 15000 }).catch(() => {});
  check((await page.locator('#fd-eval-e').innerText()).length > 0, 'a malformed eval expression is rejected by the parser');
  check(!(await conf()).some((e) => e.name === name), 'nothing was written while the form was invalid');
  await page.fill('#fd-eval', '');

  // add the field with cleaning options, then check what was written
  await page.fill('#fd-desc', 'e2e test field');
  await page.selectOption('#fd-norm', 'trim');
  await page.selectOption('#fd-valtype', 'ipv4');
  await page.click('input[name=keyScope][value=scoped]', { force: true });
  check(await page.locator('#sw-keepCase').isVisible(), 'Keep original case is offered for a case-insensitive key field');
  await page.click('[data-act=saveDrawer]');
  await page.waitForSelector(`tr[data-id="${name}"]`, { timeout: 60000 });
  await settled();
  const saved = await fieldConf(name);
  check(!!saved && saved.description === 'e2e test field' && saved.normalizer === 'trim' && saved.validation_type === 'ipv4' && saved.key_field === '1' && saved.key_scope === 'scoped' && saved.enabled === '1', 'new field options are stored (same conf properties as before, plus enabled)');
  check((await savedSearch()).search.includes(name), 'saved search regenerated with the new field');
  check((await savedSearch()).search.includes(`\`normalize_trim(${name})\``), 'saved search applies the normalizer');
  const collection = async () => (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb')).entry[0].content;
  check((await collection())[`accelerated_fields.${name}`] === JSON.stringify({ [name]: 1 }), 'key field is accelerated in the KV collection');
  check((await fieldsList()).split(',').includes(name), 'transforms fields_list updated');
  check(await row(name).locator('.keymark').count() === 1 && await row(name).locator('input, select').count() === 0, 'the row shows the key icon and has no inputs');

  // edit through the draft: Esc with unsaved changes asks first, Save writes
  await row(name).locator('[data-act=editField]').click();
  await page.waitForSelector('.drawer');
  await page.fill('#fd-desc', 'changed');
  await page.keyboard.press('Escape');
  await modal().waitFor();
  check(!!(await modal().innerText()).match(/Discard unsaved changes/), 'closing with unsaved edits asks before discarding');
  await page.click('[data-m=cancel]');
  check((await fieldConf(name)).description === 'e2e test field', 'the edit is not written before Save');
  await page.click('[data-act=saveDrawer]');
  await settled();
  check((await fieldConf(name)).description === 'changed', 'Save writes the edit');

  // the Enabled switch in the row saves on its own and removes the field from the search
  await row(name).locator('[data-act=toggleRow]').click();
  await settled();
  check((await fieldConf(name)).enabled === '0', 'the row switch disables the field in the config');
  check(!(await savedSearch()).search.includes(name), 'a disabled field is left out of the saved search');
  await row(name).locator('[data-act=toggleRow]').click();
  await settled();
  check((await savedSearch()).search.includes(name), 'enabling it puts it back');

  // duplicate opens a prefilled add form
  await row(name).locator('[data-act=dupRow]').click();
  await page.waitForSelector('#fd-name');
  await editorFocused();
  check((await page.inputValue('#fd-name')) === `${name}_copy`, 'duplicate prefills the add form');
  await page.keyboard.press('Escape');
  await modal().waitFor();
  await page.click('[data-m=ok]');

  // merge preview: a real search job whose SID can be opened in Search
  await page.click('.tab[data-tab="pipeline"]');
  await page.click('[data-act=preview]');
  await page.waitForSelector('.cards3 .kpi .v', { timeout: 180000 });
  check(/^\d+$/.test(await page.locator('.cards3 .kpi .v').first().innerText()), 'merge preview shows how many assets the merge would produce');
  const link = await page.getAttribute('a:has-text("Open in Search") >> nth=0', 'href');
  check(/\/app\/search\/search\?sid=/.test(link || ''), 'Open in Search links to the preview job by SID');

  // remove it again
  await page.click('.tab[data-tab="fields"]');
  await row(name).locator('[data-act=rmRow]').click();
  await modal().waitFor();
  await page.click('[data-m=ok]');
  await page.waitForSelector(`tr[data-id="${name}"]`, { state: 'detached', timeout: 60000 });
  await settled();
  check(!(await conf()).some((e) => e.name === name), 'field stanza removed');
  check(!(await savedSearch()).search.includes(name), 'saved search no longer mentions the field');
  check(!(await collection())[`accelerated_fields.${name}`], 'acceleration removed with the field');
  check(!(await fieldsList()).split(',').includes(name), 'transforms fields_list no longer lists the field');

  // CIM presets
  await page.click('[data-act=preset] >> nth=0');
  await modal().waitFor();
  check((await modal().innerText()).includes('nt_host'), 'the CIM dialog lists the fields it will add');
  presetsAdded = true;
  await page.click('[data-m=ok]');
  await page.waitForSelector('tr[data-id="mac"]', { timeout: 60000 });
  await settled();
  const afterPresets = (await conf()).map((e) => e.name);
  check(presetNames.every((n) => afterPresets.includes(n)), 'all CIM fields were added to assetdb.conf');
  check((await savedSearch()).search.includes('`normalize_mac(mac)`'), 'saved search uses the preset normalizers');
  const accel = await collection();
  check(['ip', 'mac', 'nt_host', 'dns'].every((n) => accel[`accelerated_fields.${n}`]), 'the four CIM key fields are indexed');

  // Sources: the first source's options are edited as a draft (max age, row filter, scope, column mapping)
  await page.click('.tab[data-tab="sources"]');
  const firstSource = JSON.parse((await generalConf()).lookups)[0].name;
  await row(firstSource).locator('[data-act=editSource]').click();
  await page.waitForSelector('#sd-age');
  await page.fill('#sd-age', '45');
  await page.selectOption('select[data-d=ageUnit]', 'd');
  await page.fill('#sd-filter', 'priority>>0');
  await page.click('[data-act=saveDrawer]');
  await page.waitForFunction(() => document.querySelector('#ab_config').shadowRoot.querySelector('#sd-filter-e')?.hidden === false, null, { timeout: 20000 }).catch(() => {});
  check((await page.locator('#sd-filter-e').innerText()).length > 0, 'an invalid row filter is rejected with the parser message');
  await page.fill('#sd-filter', 'priority>0');
  await page.fill('#sd-scope', 'E2E_Site');
  await page.click('[data-act=mapAdd]');
  await page.locator('input[data-dm=to]').last().fill('owner');
  await page.locator('[data-dm=from]').last().fill('Owner Name').catch(async () => { await page.locator('select[data-dm=from]').last().selectOption({ index: 0 }); });
  await page.click('[data-act=saveDrawer]');
  await settled();
  const demo = JSON.parse((await generalConf()).lookups)[0];
  check(demo.max_age === '45d' && demo.filter === 'priority>0' && demo.scope === 'E2E_Site' && demo.enabled === true && !!demo.columns.owner, 'source options stored in the lookups JSON');
  check((await savedSearch()).search.includes('relative_time(now(), "-45d")'), 'saved search applies the max age');

  // Settings: validated, saved to [general] and the saved search schedule, then put back
  await page.click('.tab[data-tab="settings"]');
  await page.fill('#st-max_keys', '500');
  await page.click('[data-act=ssave]');
  check((await page.locator('#st-max_keys-e').innerText()).length > 0, 'max keys above the hard cap is rejected');
  await page.fill('#st-max_keys', '30');
  await page.fill('#st-min_pct', '40');
  await page.click('[data-act=ssave]');
  await settled();
  const g = await generalConf();
  check(g.max_keys === '30' && g.min_ratio === '0.4', 'max keys and the safety ratio saved (percent is stored as a ratio)');
  check((await savedSearch()).search.includes('adbmerge max_keys=30'), 'saved search regenerated with the new max keys');
} catch (e) {
  errors.push(String(e));
} finally {
  const csrf = (await ctx.cookies()).find((k) => /csrf_token/.test(k.name));
  const hdr = csrf ? { 'X-Splunk-Form-Key': csrf.value, 'X-Requested-With': 'XMLHttpRequest' } : {};
  const root = `${base}/en-US/splunkd/__raw/servicesNS/nobody/assetdb`;
  const post = (path, form) => ctx.request.post(`${root}${path}`, { headers: hdr, form: { ...form, output_mode: 'json' } }).catch(() => {});
  // best-effort cleanup so a failed run leaves nothing behind
  const present = (await conf().catch(() => [])).map((e) => e.name);
  for (const n of [name, `${name}_copy`].concat(presetsAdded ? presetNames : []).filter((x) => present.includes(x))) await ctx.request.delete(`${root}/configs/conf-assetdb/${n}`, { headers: hdr }).catch(() => {});
  if (originalGeneral) {
    const restore = {};
    for (const k of ['max_keys', 'min_ratio', 'lookups']) if (originalGeneral[k] !== undefined) restore[k] = originalGeneral[k];
    await post('/configs/conf-assetdb/general', restore);
  }
  if (originalFieldsList !== undefined) await post('/configs/conf-transforms/assetdb', { fields_list: originalFieldsList });
  if (originalMacro !== undefined) await post('/data/macros/adb_enrich_outputs', { definition: originalMacro });
  const current = (await rest('/servicesNS/nobody/assetdb/storage/collections/config/assetdb').catch(() => ({ entry: [{ content: {} }] }))).entry[0].content;
  const clear = {};
  for (const n of [name].concat(presetNames)) for (const k of [`accelerated_fields.${n}`, `field.${n}`]) if (current[k]) clear[k] = '';
  if (Object.keys(clear).length) await post('/storage/collections/config/assetdb', clear);
  if (originalSearch !== undefined) await post('/saved/searches/assetdb-lookupgen', { search: originalSearch, ...originalSched });
  const after = await conf().catch(() => []);
  check(!after.some((e) => [name, `${name}_copy`].concat(presetNames).includes(e.name)), 'test fields cleaned up');
  check(!originalGeneral || (await generalConf().catch(() => ({}))).lookups === originalLookups, 'lookups config restored');
  check((await savedSearch().catch(() => ({}))).search === originalSearch, 'saved search restored to its original text');
  await page.screenshot({ path: 'dist/e2e-flow.png' }).catch(() => {});
  await browser.close();
}
if (errors.length) { console.error('FAILED:\n' + errors.join('\n')); process.exit(1); }
console.log('UI flow OK');
