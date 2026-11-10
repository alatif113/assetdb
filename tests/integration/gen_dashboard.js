'use strict';
// Prints the searches the Explorer and Coverage dashboards run, redirected to a temporary collection, as JSON.
// Usage: node gen_dashboard.js <test_collection> < {"fieldArray": [...], "q": "", "cov_by": "No grouping", "asset": "<_key>"}
// The dashboards' own search text is read from default/data/ui/views/*.xml, so what runs here is what ships. Macros are written out the way
// Splunk does (adb_icon, adb_prov_*), and adb_provenance gets the definition the Configure page would generate for this configuration.
const fs = require('node:fs');
const path = require('node:path');
const { loadGenerator } = require('../js/load-generator');
const { parseMacros, expandMacros } = require('../js/macros');

const target = process.argv[2];
if (!/^[A-Za-z0-9_]+$/.test(target || '')) { console.error('usage: node gen_dashboard.js <test_collection> < input.json'); process.exit(2); }
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const G = loadGenerator();
const views = path.join(__dirname, '..', '..', 'default', 'data', 'ui', 'views');
const query = (view, id) => {
	const xml = fs.readFileSync(path.join(views, view + '.xml'), 'utf8');
	const m = new RegExp(`<search id="${id}">\\s*<query><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></query>`).exec(xml);
	if (!m) throw new Error(`${view}: no search ${id}`);
	return m[1];
};
const macros = parseMacros();
const prov = G.buildProvenanceMacro(input.fieldArray);
macros['adb_provenance(1)'] = { args: ['key'], definition: prov.definition };
const finish = (spl) => {
	let out = expandMacros(spl, macros, null).replace(/\$\$/g, '$');
	out = out.replace(/\binputlookup assetdb\b(?!_)/g, `inputlookup ${target}`);
	const real = out.match(/\bassetdb_runs\b|\bassetdb_overflow\b|(?:inputlookup|outputlookup|lookup) assetdb(?![\w])/);
	if (real) throw new Error(`a dashboard search still reaches the real collections (${real[0]})`);
	return out;
};
const sub = (spl) => spl.replace(/\$adb_q\|s\$/g, JSON.stringify(input.q || '')).replace(/\$cov_by\$/g, input.cov_by || 'No grouping').replace(/\$adb_asset\$/g, String(input.asset || ''));
const out = {
	assets: finish(sub(query('assetdb_explorer', 'ds_assets'))),
	total: finish(sub(query('assetdb_explorer', 'ds_total'))),
	cov: finish(sub(query('assetdb_coverage', 'ds_cov'))),
};
if (input.asset) out.prov = finish(sub(query('assetdb_explorer', 'ds_prov')));
process.stdout.write(JSON.stringify(out));
