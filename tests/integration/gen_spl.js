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
const { expandMacros } = require('../js/macros');
// The merge steps are macros whose definitions name the real collections (assetdb_runs, assetdb_overflow, assetdb), so the macros are written out
// first: a name replacement on the unexpanded search would leave them pointing at the real run history and overflow list.
const spl = expandMacros(makeMergeSearch(JSON.parse(input)));
const tail = /\| outputlookup override_if_empty=false assetdb$/;
if (!tail.test(spl)) throw new Error('generated search no longer ends with "| outputlookup override_if_empty=false assetdb"');
// the temporary collection gets its own run history too, so the real assetdb_runs is never written
const out = spl.replace(tail, `| outputlookup override_if_empty=false ${target}`).replace(/\bassetdb_runs\b/g, `${target}_runs`).replace(/\bassetdb_overflow\b/g, `${target}_overflow`).replace(/(inputlookup(?: append=true)?) assetdb(?![\w])/g, `$1 ${target}`);
// a test must never touch the real collections: refuse to print a search that still names one
const real = out.match(/\bassetdb_runs\b|\bassetdb_overflow\b|(?:inputlookup(?: append=true)?|outputlookup[^|]*|lookup) assetdb(?![\w])|`adb_(?:run_guard|record_run|save_overflow)\(/);
if (real) throw new Error(`the test search still reaches the real collections (${real[0]}): expand the macro that names it`);
process.stdout.write(out);
