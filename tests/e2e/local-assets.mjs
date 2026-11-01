// With E2E_LOCAL_ASSETS=1 the browser is served the repo's built js/css instead of what is deployed, so the UI can be
// exercised against a real Splunk without a deploy and restart (Splunk caches app static files for a year per build).
import fs from 'node:fs';

const ROOT = decodeURIComponent(new URL('../../appserver/static/', import.meta.url).pathname);

export async function routeLocalAssets(page) {
  if (process.env.E2E_LOCAL_ASSETS !== '1') return;
  await page.route(/\/app\/assetdb\/js\/\w+\.min\.js/, (r) => {
    const f = r.request().url().match(/js\/(\w+\.min\.js)/)[1];
    r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(`${ROOT}js/${f}`) });
  });
  await page.route(/\/app\/assetdb\/css\/(assetdb|page)\.css/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(`${ROOT}css/${r.request().url().match(/css\/(\w+)\.css/)[1]}.css`) }));
}
