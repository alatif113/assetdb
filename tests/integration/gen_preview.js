'use strict';
// Prints the preview searches of the generated merge search as JSON, for a fieldArray read from stdin.
const { load, loadGenerator } = require('../js/load-generator');
const fieldArray = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
// argv[2] is the name of the temporary collection that stands in for assetdb (and its _runs/_overflow)
const target = process.argv[2] || 'assetdb';
const generator = loadGenerator();
const lines = JSON.parse(JSON.stringify(load().makeMergeSearchLines(fieldArray)));
const searches = generator.buildPreviewSearches(lines);
searches.diff = generator.buildPreviewDiff(lines);
const retarget = (spl) => spl.replace(/\bassetdb_runs\b/g, `${target}_runs`).replace(/\bassetdb_overflow\b/g, `${target}_overflow`).replace(/(inputlookup(?: append=true)?) assetdb(?![\w])/g, `$1 ${target}`);
for (const k of Object.keys(searches)) searches[k] = retarget(searches[k]);
process.stdout.write(JSON.stringify(searches));
