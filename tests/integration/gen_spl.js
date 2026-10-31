'use strict';
// Prints the SPL that makeMergeSearch() generates for a fieldArray read from stdin (JSON),
// with the final `outputlookup assetdb` redirected to the lookup named by argv[2].
// Usage: node gen_spl.js <test_lookup_name> < fieldArray.json
const { load } = require('../js/load-generator');

const target = process.argv[2];
if (!/^[A-Za-z0-9_]+$/.test(target || '')) {
	console.error('usage: node gen_spl.js <test_lookup_name> < fieldArray.json');
	process.exit(2);
}
const input = require('node:fs').readFileSync(0, 'utf8');
const { makeMergeSearch } = load();
const spl = makeMergeSearch(JSON.parse(input));
const tail = /\| outputlookup override_if_empty=false assetdb$/;
if (!tail.test(spl)) throw new Error('generated search no longer ends with "| outputlookup override_if_empty=false assetdb"');
// the temporary collection gets its own run history too, so the real assetdb_runs is never written
process.stdout.write(spl.replace(tail, `| outputlookup override_if_empty=false ${target}`).replace(/\bassetdb_runs\b/g, `${target}_runs`).replace(/\bassetdb_overflow\b/g, `${target}_overflow`).replace(/\bassetdb_changes\b/g, `${target}_changes`).replace(/inputlookup assetdb(?![\w])/g, `inputlookup ${target}`));
