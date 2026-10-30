'use strict';
// Golden-file tests for makeMergeSearch(). Update goldens deliberately with:
//   UPDATE_GOLDEN=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load-generator');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const CONFIGS = path.join(FIXTURES, 'configs');
const GOLDEN = path.join(FIXTURES, 'golden');
const update = process.env.UPDATE_GOLDEN === '1';

for (const file of fs.readdirSync(CONFIGS).filter((f) => f.endsWith('.json')).sort()) {
	const cfg = JSON.parse(fs.readFileSync(path.join(CONFIGS, file), 'utf8'));

	test(`${cfg.name}: ${cfg.description}`, () => {
		const { makeMergeSearch } = load({ confEntries: cfg.confEntries });
		const spl = makeMergeSearch(cfg.fieldArray) + '\n';
		const goldenPath = path.join(GOLDEN, `${cfg.name}.spl`);

		if (update) {
			fs.writeFileSync(goldenPath, spl);
			return;
		}
		assert.ok(fs.existsSync(goldenPath), `missing golden ${goldenPath}; run UPDATE_GOLDEN=1 npm test`);
		assert.equal(spl, fs.readFileSync(goldenPath, 'utf8'));
	});
}

test('getLookupArray: JSON, legacy comma list, and missing general stanza', () => {
	// JSON round trip: arrays created inside the vm sandbox have a different Array prototype.
	const getLookupArray = (a) => JSON.parse(JSON.stringify(load().getLookupArray(a)));
	assert.deepEqual(getLookupArray([{ name: 'general', content: { lookups: '[{"name":"n","lookup":"n.csv"}]' } }]), [{ name: 'n', lookup: 'n.csv' }]);
	assert.deepEqual(getLookupArray([{ name: 'general', content: { lookups: 'a.csv,b.csv' } }]), [
		{ name: 'a.csv', lookup: 'a.csv' },
		{ name: 'b.csv', lookup: 'b.csv' },
	]);
	assert.deepEqual(getLookupArray([]), []);
	assert.deepEqual(getLookupArray([{ name: 'general', content: { lookups: '' } }]), []);
});

test('generated search always ends by writing the assetdb KV store', () => {
	const { makeMergeSearch } = load();
	const spl = makeMergeSearch(JSON.parse(fs.readFileSync(path.join(CONFIGS, 'single_lookup_basic.json'), 'utf8')).fieldArray);
	assert.match(spl, /\| outputlookup assetdb$/);
	assert.match(spl, /\| adbmerge max_keys=25/);
});

test('every fixture has a golden file and vice versa', () => {
	const cfgs = fs.readdirSync(CONFIGS).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
	const goldens = fs.readdirSync(GOLDEN).filter((f) => f.endsWith('.spl')).map((f) => f.replace(/\.spl$/, '')).sort();
	assert.deepEqual(goldens, cfgs);
});

function mvField(name, extra) {
	return { name, content: Object.assign({ key_field: '0', case_sensitive: '1', ignore_values: '[]', fillnull: '', validation: '', field_type: 'multivalue', merge_method: 'latest', merge_order: '', max_values: '5', eval_expression: '' }, extra) };
}
const general = { name: 'general', content: { lookups: '[{"name":"a","lookup":"a.csv"}]' } };

test('max_values is clamped to at least 1 and falls back to the default when invalid', () => {
	const { makeMergeSearch } = load();
	const spl = makeMergeSearch([general, mvField('m1', { max_values: '-5' }), mvField('m2', { max_values: '' }), mvField('m3', { max_values: 'abc' }), mvField('m4', { max_values: '0' }), mvField('m5', { max_values: '3' })]);
	assert.match(spl, /m1 = mvindex\(m1,0,0\)/);
	assert.match(spl, /m2 = mvindex\(m2,0,9\)/);
	assert.match(spl, /m3 = mvindex\(m3,0,9\)/);
	assert.match(spl, /m4 = mvindex\(m4,0,0\)/);
	assert.match(spl, /m5 = mvindex\(m5,0,2\)/);
	assert.ok(!/NaN|,-\d/.test(spl), spl);
});

test('malformed ignore_values is treated as empty instead of throwing', () => {
	const { makeMergeSearch } = load();
	const spl = makeMergeSearch([general, mvField('m1', { ignore_values: '{not json' })]);
	assert.ok(!/Ignore values/.test(spl), spl);
});

test('non-JSON conf response does not throw', () => {
	const { makeMergeSearch } = load({ confEntries: [] });
	assert.doesNotThrow(() => makeMergeSearch([]));
});
