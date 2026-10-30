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
