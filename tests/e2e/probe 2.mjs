import { chromium } from 'playwright';
const b = await chromium.launch(); const c = await b.newContext({ ignoreHTTPSErrors: true }); const p = await c.newPage();
await p.goto(process.env.SPLUNK_WEB_URL + '/en-US/app/assetdb/configure', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#ab_config .lookups-table', { timeout: 60000 });
console.log(await p.evaluate(() => new Promise((res) => require(['splunkjs/mvc/utils', 'splunk.util'], (U, SU) => {
  res(JSON.stringify({ info: U.getPageInfo && U.getPageInfo(), keys: Object.keys(U).join(','), su: SU.make_url('/app/x'), sukeys: Object.keys(SU).filter(k=>/url/i.test(k)).join(','), root: window.$C && window.$C.MRSPARKLE_ROOT_PATH, loc: window.$C && window.$C.LOCALE }));
}))));
await b.close();
