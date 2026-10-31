'use strict';
// Prints the preview searches of the generated merge search as JSON, for a fieldArray read from stdin.
const { load, loadGenerator } = require('../js/load-generator');
const fieldArray = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const lines = load().makeMergeSearchLines(fieldArray);
process.stdout.write(JSON.stringify(loadGenerator().buildPreviewSearches(JSON.parse(JSON.stringify(lines)))));
