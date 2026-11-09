'use strict';
// The integration tests merge into temporary collections. The merge steps are macros that name the real ones (assetdb_runs, assetdb_overflow,
// assetdb), so the search the tests run must have those macros written out and every name redirected: a test must never write the real run
// history or overflow list (it once did, and trimmed them).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const GEN = path.join(__dirname, '..', 'integration', 'gen_spl.js');
const gen = (cfg) => execFileSync('node', [GEN, 'adbtest_x'], { input: JSON.stringify(cfg) }).toString();
const base = (extra = {}) => [{ name: 'general', content: Object.assign({ lookups: JSON.stringify([{ name: 'a', lookup: 'a.csv' }]) }, extra) },
	{ name: 'mac', content: { key_field: '1', field_type: 'single' } }, { name: 'owner', content: { key_field: '0', field_type: 'single' } }];

test('the search of a test names only the temporary collections', () => {
	const spl = gen(base());
	assert.ok(spl.includes('adbtest_x_runs') && spl.includes('adbtest_x_overflow'), 'run history and overflow list are redirected');
	assert.ok(spl.endsWith('| outputlookup override_if_empty=false adbtest_x'));
	assert.ok(!/\bassetdb_runs\b|\bassetdb_overflow\b/.test(spl), 'no real collection is named');
	assert.ok(!/(inputlookup|outputlookup|lookup)[^|]* assetdb(?![\w])/.test(spl.replace(/adbtest_x/g, '')), 'the asset database itself is not touched');
	assert.ok(!/`adb_(run_guard|record_run|save_overflow)\(/.test(spl), 'the macros that name the real collections are written out');
});

test('a source that is not named like the others still leaves the real collections alone', () => {
	[base({ max_keys: '50' }), base({ run_guard_min_ratio: '0.9' })].forEach((cfg) => assert.ok(!/\bassetdb_runs\b|\bassetdb_overflow\b/.test(gen(cfg))));
});
