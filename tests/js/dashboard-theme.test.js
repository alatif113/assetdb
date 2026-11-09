'use strict';
// The three dashboards are dark by default (Splunk themes a classic dashboard from its XML theme attribute, or ?theme= in the URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VIEWS = path.join(__dirname, '..', '..', 'default', 'data', 'ui', 'views');

test('configure, explorer and coverage declare the dark theme', () => {
	for (const v of ['configure', 'assetdb_explorer', 'assetdb_coverage']) {
		const root = /<(dashboard|form)\b[^>]*>/.exec(fs.readFileSync(path.join(VIEWS, `${v}.xml`), 'utf8'))[0];
		assert.match(root, /\btheme="dark"/, `${v}: ${root}`);
	}
});
