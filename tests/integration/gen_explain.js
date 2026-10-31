'use strict';
// Prints the explain search for the given asset keys. Usage: node gen_explain.js '["key1","key2"]' < fieldArray.json
const { load, loadGenerator } = require('../js/load-generator');
const fieldArray = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const keys = JSON.parse(process.argv[2]);
const lines = JSON.parse(JSON.stringify(load().makeMergeSearchLines(fieldArray)));
const names = fieldArray.filter((f) => f.name !== 'general').map((f) => f.name);
process.stdout.write(loadGenerator().buildExplainSearch(lines, keys, names));
