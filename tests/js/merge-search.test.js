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

// --- escaping / validation of config values (F-03, F-10, F-11, F-12, F-14) ----------

function single(name, extra) {
	return mvField(name, Object.assign({ field_type: 'single' }, extra));
}
const gen = (fields, lookups) => load().makeMergeSearch([lookups || general].concat(fields));

test('field names that are not plain identifiers are rejected', () => {
	for (const bad of ['src.ip', 'dest-host', '9lives', 'naïve', 'a b', 'a"b', "a'b", 'a]']) {
		assert.throws(() => gen([single(bad)]), /field name/i, bad);
	}
	assert.doesNotThrow(() => gen([single('_ok1'), single('Ab_9')]));
});

test('fillnull and validation are SPL-quoted; input names are restricted', () => {
	const spl = gen([single('f', { fillnull: 'a"b\\c', validation: '^\\d+"$' })]);
	assert.ok(spl.includes('"a\\"b\\\\c"'), spl);
	assert.ok(spl.includes('match(f, "^\\\\d+\\"$")'), spl);
	assert.ok(spl.includes('source_lookup="a.csv", "a"'), spl);
	assert.throws(() => gen([single('f')], { name: 'general', content: { lookups: '[{"name":"n\\"x","lookup":"a.csv"}]' } }), /input name/i);
});

test('lookup files must look like lookup names', () => {
	for (const bad of ['a.csv) | delete', 'a`b', 'a b.csv', 'a"b']) {
		assert.throws(() => gen([single('f')], { name: 'general', content: { lookups: JSON.stringify([{ name: 'n', lookup: bad }]) } }), /lookup/i, bad);
	}
});

test('eval_expression cannot start a new command but may use brackets inside strings', () => {
	for (const bad of ['1 | delete', 'a `macro`', 'x [search index=*]', 'replace(f, "a", "b") ] ', 'f + "unterminated']) {
		assert.throws(() => gen([single('f', { field_type: 'eval', eval_expression: bad })]), /eval/i, bad);
	}
	const spl = gen([single('f', { field_type: 'eval', eval_expression: 'replace(g, "[^w|]", "")' })]);
	assert.ok(spl.includes('f = replace(g, "[^w|]", "")'), spl);
});

test('merge_order entries and merge_method are restricted', () => {
	assert.throws(() => gen([single('f', { merge_method: 'coalesce', merge_order: 'a,b) | delete' })]), /merge order/i);
	assert.throws(() => gen([single('f', { merge_method: 'median(x) as y, evil' })]), /merge method/i);
});

test('ignore values are SPL-escaped, lowercased for case-insensitive fields, and skipped when empty', () => {
	const spl = gen([
		single('ci', { case_sensitive: '0', ignore_values: JSON.stringify(['Unknown', 'say "hi"']) }),
		single('cs', { case_sensitive: '1', ignore_values: JSON.stringify(['Unknown']) }),
		single('none', { ignore_values: '[]' }),
	]);
	assert.ok(spl.includes('ci = if(in(ci, "unknown", "say \\"hi\\""), null(), ci)'), spl);
	assert.ok(spl.includes('cs = if(in(cs, "Unknown"), null(), cs)'), spl);
	assert.ok(!/in\(none/.test(spl), spl);
	assert.ok(!spl.includes('&quot;'), spl);
});

test('fillnull is not applied to key fields', () => {
	const spl = gen([single('k', { key_field: '1', fillnull: 'x' }), single('v', { fillnull: 'y' })]);
	assert.ok(!/isnull\(k\)/.test(spl), spl);
	assert.ok(/isnull\(v\)/.test(spl), spl);
});
