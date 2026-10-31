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
	assert.ok(spl.includes('ci = mvfilter(NOT (in(lower(ci), "unknown", "say \\"hi\\"")))'), spl);
	assert.ok(spl.includes('cs = mvfilter(NOT (in(cs, "Unknown")))'), spl);
	assert.ok(!/none = mvfilter/.test(spl), spl);
	assert.ok(!spl.includes('&quot;'), spl);
});

test('fillnull is not applied to key fields', () => {
	const spl = gen([single('k', { key_field: '1', fillnull: 'x' }), single('v', { fillnull: 'y' })]);
	assert.ok(!/isnull\(k\)/.test(spl), spl);
	assert.ok(/isnull\(v\)/.test(spl), spl);
});

// --- single aggregation of merge methods (F-04) --------------------------------------

test('avg is computed from sums and counts, not an average of averages', () => {
	const spl = gen([single('score', { merge_method: 'avg' })]);
	const [first, second] = spl.split('| adbmerge max_keys=25');
	assert.ok(first.includes('sum(score) as score__sum, count(score) as score__count'), spl);
	assert.ok(second.includes('sum(score__sum) as score__sum, sum(score__count) as score__count'), spl);
	assert.ok(second.includes('| eval score = score__sum / score__count'), spl);
	assert.ok(!/avg\(/.test(spl), spl);
});

test('latest keeps _time through the first stats so the second stats can order by it', () => {
	const spl = gen([single('owner', { merge_method: 'latest' })]);
	const [first, second] = spl.split('| adbmerge max_keys=25');
	assert.ok(/latest\(_time\) as _time/.test(first), spl);
	assert.ok(!/latest\(_time\)/.test(second), spl);
	assert.ok(!/latest\(_time\)/.test(gen([single('n', { merge_method: 'max' })])), 'no _time needed for max');
});

test('max_keys comes from the general stanza, default 25, invalid values fall back', () => {
	const withKeys = (v) => gen([single('f')], { name: 'general', content: { lookups: general.content.lookups, max_keys: v } });
	assert.match(withKeys('40'), /\| adbmerge max_keys=40 max_key_share=50\n/);
	assert.match(withKeys('500'), /\| adbmerge max_keys=100 max_key_share=50\n/, 'hard cap');
	for (const bad of ['', '0', '-3', 'abc', undefined]) assert.match(withKeys(bad), /\| adbmerge max_keys=25 max_key_share=50\n/, String(bad));
});

test('last_seen is the max source _time, carried through both stats and written to the output', () => {
	const spl = gen([single('owner', { merge_method: 'max' })]);
	const [first, second] = spl.split('| adbmerge max_keys=25');
	assert.ok(first.includes('max(_time) as last_seen'), spl);
	assert.ok(second.includes('max(last_seen) as last_seen'), spl);
	assert.ok(second.includes('| table _key, asset, source, source_lookup, last_seen, owner'), spl);
});

// --- fill null after the merge, recent-first multivalue order ----------------------------

test('fill null is applied after the merge, never per source row', () => {
	const spl = gen([single('k', { key_field: '1' }), single('owner', { fillnull: 'unknown' })]);
	const [before, after] = spl.split('| adbmerge max_keys=25');
	assert.ok(!/isnull\(owner\)/.test(before), 'no fill null before the merge:\n' + before);
	assert.ok(/\| eval owner = if\(isnull\(owner\), "unknown", owner\)/.test(after), after);
	assert.ok(after.indexOf('isnull(owner)') > after.indexOf('| stats values(asset)'), 'fill null comes after the final stats');
});

test('multivalue fields keep the most recent values by default and can opt into alphabetical', () => {
	const recent = gen([mvField('ip', { max_values: '3' })]);
	assert.ok(recent.includes('| sort 0 -_time'), recent);
	assert.ok(/list\(ip\) as ip/.test(recent), recent);
	assert.ok(recent.includes('ip = mvdedup(ip)'), recent);
	assert.ok(recent.indexOf('mvdedup(ip)') < recent.indexOf('mvindex(ip,0,2)'), 'de-duplicate before trimming');
	assert.equal((recent.match(/\| sort 0 -_time/g) || []).length, 2, 'sorted before both stats');

	const alpha = gen([mvField('ip', { max_values: '3', mv_order: 'alpha' })]);
	assert.ok(!alpha.includes('sort 0'), alpha);
	assert.ok(/values\(ip\) as ip/.test(alpha), alpha);
});

// --- normalizers, typed validation, case handling, value type ----------------------------

test('normalizer presets call their macro after the split and before case/validation; unknown presets are rejected', () => {
	const spl = gen([single('mac', { key_field: '1', normalizer: 'mac' }), single('os', { normalizer: 'os' }), single('plain')]);
	assert.ok(spl.includes('| `normalize_mac(mac)`'), spl);
	assert.ok(spl.includes('| `normalize_os(os)`'), spl);
	assert.ok(!spl.includes('normalize_trim'), spl);
	assert.ok(spl.indexOf('normalize_mac') > spl.indexOf('split('), 'after the split');
	assert.throws(() => gen([single('f', { normalizer: 'rot13' })]), /normalizer/i);
});

test('the global default normalizer and case rule apply to fields that do not set their own', () => {
	const withDefaults = (fields) => gen(fields, { name: 'general', content: { lookups: general.content.lookups, default_normalizer: 'trim', default_case_sensitive: '1' } });
	const spl = withDefaults([single('a'), single('b', { normalizer: 'none' }), single('c', { normalizer: 'default' }), single('d', { case_sensitive: '0' })]);
	assert.ok(spl.includes('`normalize_trim(a)`') && spl.includes('`normalize_trim(c)`'), spl);
	assert.ok(!spl.includes('normalize_trim(b)'), spl);
	assert.ok(/foreach d \[eval <<FIELD>>=lower/.test(spl), 'explicit case_sensitive=0 beats the default: ' + spl);
	const unsetCase = withDefaults([{ name: 'e', content: { field_type: 'single', merge_method: 'latest' } }]);
	assert.ok(!/foreach e \[eval <<FIELD>>=lower/.test(unsetCase), 'default case sensitive keeps e as is');
});

test('typed validation drops values that do not match and rejects unknown types', () => {
	const spl = gen([single('ip', { validation_type: 'ip' }), single('mail', { validation_type: 'email', validation: '@corp\\.com$' })]);
	assert.ok(/ip=mvfilter\(match\(ip, "\^\(\(\(25\[0-5\]/.test(spl), spl);
	// the typed check runs before the custom regex of the same field
	assert.ok(spl.indexOf('mail=mvfilter(match(mail, "^[^@') < spl.indexOf('mail=mvfilter(match(mail, "@corp'), spl);
	assert.throws(() => gen([single('f', { validation_type: 'zip' })]), /validation type/i);
});

test('validation type patterns accept and reject the right values', () => {
	const { VALIDATION_TYPES } = require('./load-generator').loadGenerator();
	const re = (t) => new RegExp(VALIDATION_TYPES[t]);
	const cases = {
		ipv4: [['10.1.2.3', true], ['255.255.255.255', true], ['256.1.1.1', false], ['1.2.3', false], ['1.2.3.4.5', false]],
		ipv6: [['fe80::1', true], ['2001:db8::8a2e:370:7334', true], ['10.1.2.3', false], ['nonsense', false]],
		ip: [['10.1.2.3', true], ['fe80::1', true], ['host', false]],
		mac: [['aa:bb:cc:dd:ee:ff', true], ['AA-BB-CC-DD-EE-FF', true], ['aabbccddeeff', false], ['aa:bb:cc:dd:ee', false]],
		email: [['a@b.co', true], ['a b@c.com', false], ['a@b', false]],
		hostname: [['host-1', true], ['-bad', false], ['a.b', false]],
		fqdn: [['host.corp.example.com', true], ['host', false], ['host.c', false]],
		cidr: [['10.0.0.0/8', true], ['10.0.0.0/33', false], ['10.0.0.0', false]],
		integer: [['42', true], ['-7', true], ['4.2', false]],
		number: [['4.2', true], ['-7', true], ['abc', false], ['4.', false]],
	};
	for (const [type, list] of Object.entries(cases)) {
		for (const [value, ok] of list) assert.equal(re(type).test(value), ok, `${type}: ${value}`);
	}
});

test('keep original case: key matching is lowercased in a temp field and the stored value keeps its case', () => {
	const spl = gen([single('host', { key_field: '1', case_sensitive: '0', keep_case: '1' }), single('mac', { key_field: '1', case_sensitive: '0' })]);
	assert.ok(spl.includes('adbk_host = lower(host), adbk_mac = mac'), spl);
	assert.ok(!/foreach [^\n]*host[^\n]*lower\(<<FIELD>>\)/.test(spl), 'host is not lowercased in place:\n' + spl);
	assert.ok(/foreach mac \[eval <<FIELD>>=lower/.test(spl), spl);
	assert.ok(spl.includes('_key = mvjoin(mvdedup(mvappend(adbk_host, adbk_mac)), "::")'), spl);
	assert.ok(spl.includes('values(adbk_host) as adbk_host'), spl);
	assert.ok(spl.includes('| eval _key = mvappend(adbk_host, adbk_mac)'), spl);
});

test('value type is validated', () => {
	assert.doesNotThrow(() => gen([single('n', { value_type: 'number' })]));
	assert.throws(() => gen([single('n', { value_type: 'decimal' })]), /value type/i);
});

test('every normalizer preset has a macro in macros.conf', () => {
	const macros = require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'default', 'macros.conf'), 'utf8');
	const { NORMALIZERS } = require('./load-generator').loadGenerator();
	for (const [preset, macro] of Object.entries(NORMALIZERS)) {
		if (macro) assert.ok(macros.includes(`[${macro}(1)]`), `${preset} -> ${macro}`);
	}
});

// --- ignore regex / CIDR / global list, allowed sources, merge methods, numeric types ------

test('ignore entries can be exact values, re: regexes or cidr: networks', () => {
	const spl = gen([single('ip', { case_sensitive: '0', ignore_values: JSON.stringify(['unknown', 're:^169\\.254\\.', 'cidr:10.0.0.0/8']) })]);
	assert.ok(spl.includes('ip = mvfilter(NOT (in(lower(ip), "unknown") OR match(lower(ip), "^169\\\\.254\\\\.") OR cidrmatch("10.0.0.0/8", ip)))'), spl);
	assert.throws(() => gen([single('f', { ignore_values: JSON.stringify(['re:(unclosed']) })]), /ignore regex/i);
	assert.throws(() => gen([single('f', { ignore_values: JSON.stringify(['cidr:not-a-network']) })]), /ignore CIDR/i);
});

test('the global ignore list is inherited unless a field opts out', () => {
	const cfg = (fields) => gen(fields, { name: 'general', content: { lookups: general.content.lookups, ignore_values: JSON.stringify(['n/a', 'cidr:127.0.0.0/8']) } });
	const spl = cfg([single('a', { ignore_values: '[]', case_sensitive: '0' }), single('b', { ignore_values: '[]', inherit_ignore: '0' }), single('c', { ignore_values: JSON.stringify(['x']), case_sensitive: '1' })]);
	assert.ok(spl.includes('a = mvfilter(NOT (in(lower(a), "n/a") OR cidrmatch("127.0.0.0/8", a)))'), spl);
	assert.ok(!/b = mvfilter/.test(spl), 'field b opted out: ' + spl);
	assert.ok(spl.includes('c = mvfilter(NOT (in(c, "x", "n/a") OR cidrmatch("127.0.0.0/8", c)))'), spl);
});

test('allowed sources null out values from other sources, after the source name is known', () => {
	const lookups = JSON.stringify([{ name: 'cmdb', lookup: 'a.csv' }, { name: 'edr', lookup: 'b.csv' }]);
	const spl = gen([single('owner', { allowed_sources: 'cmdb' })], { name: 'general', content: { lookups } });
	assert.ok(spl.includes('owner = if(in(source, "cmdb"), owner, null())'), spl);
	assert.ok(spl.indexOf('| eval source=case(') < spl.indexOf('in(source, "cmdb")'), 'source mapped first');
	assert.ok(spl.indexOf('in(source, "cmdb")') < spl.indexOf('| search _key=*') || !spl.includes('| search _key=*'), spl);
	assert.throws(() => gen([single('owner', { allowed_sources: 'a"b' })]), /allowed source/i);
});

test('earliest picks the first value exactly through both stats; sum is a plain sum', () => {
	const spl = gen([single('first_name', { merge_method: 'earliest' }), single('hits', { merge_method: 'sum' })]);
	assert.ok(spl.includes('first_name__e = if(isnotnull(first_name), printf("%015.3f", coalesce(_time, 0)) . "|" . first_name, null())'), spl);
	assert.equal((spl.match(/min\(first_name__e\) as first_name__e/g) || []).length, 2, 'both stats');
	assert.ok(spl.includes('first_name = replace(first_name__e, "^[^|]*\\|", "")'), spl);
	assert.equal((spl.match(/sum\(hits\) as hits/g) || []).length, 2, spl);
});

test('numeric and time value types are converted so min and max compare numbers', () => {
	const spl = gen([single('score', { merge_method: 'max', value_type: 'number' }), single('label', { merge_method: 'max', value_type: 'string' })]);
	assert.ok(/\| eval score = tonumber\(score\)\n/.test(spl), spl);
	assert.ok(!spl.includes('tonumber(label)'), spl);
	assert.ok(spl.indexOf('tonumber(score)') < spl.indexOf('| stats values(source)'), 'before the first stats');
});

// --- source options: enabled, role, column mapping, max age, time column, row filter ---------

const withSources = (sources, fields) => gen(fields || [single('mac', { key_field: '1' }), single('owner')], { name: 'general', content: { lookups: JSON.stringify(sources) } });

test('disabled sources are left out completely', () => {
	const spl = withSources([{ name: 'a', lookup: 'a.csv' }, { name: 'b', lookup: 'b.csv', enabled: false }, { name: 'c', lookup: 'c.csv', enabled: '0' }]);
	assert.ok(spl.includes('input_adb_lookup(a.csv)'), spl);
	assert.ok(!spl.includes('b.csv') && !spl.includes('c.csv'), spl);
	assert.ok(spl.includes('source=case(source_lookup="a.csv", "a")'), spl);
	assert.ok(withSources([{ name: 'a', lookup: 'a.csv', enabled: true }, { name: 'b', lookup: 'b.csv' }]).includes('b.csv'), 'enabled by default');
});

test('column mapping renames source columns into fields for that source only', () => {
	const spl = withSources([
		{ name: 'a', lookup: 'a.csv', columns: { mac: 'MAC Address', owner: 'Owner Name' } },
		{ name: 'b', lookup: 'b.csv', columns: { mac: 'hw_addr' } },
	]);
	assert.ok(spl.includes(`| eval mac = case(source_lookup="a.csv", 'MAC Address', source_lookup="b.csv", 'hw_addr', true(), mac), owner = case(source_lookup="a.csv", 'Owner Name', true(), owner)`), spl);
	assert.ok(spl.indexOf('Map source columns') < spl.indexOf('Build match keys'), 'mapped before the keys are built');
	assert.throws(() => withSources([{ name: 'a', lookup: 'a.csv', columns: { 'bad field': 'x' } }]), /field name/i);
	assert.throws(() => withSources([{ name: 'a', lookup: 'a.csv', columns: { mac: "x' OR 1=1 OR 'y" } }]), /column/i);
});

test('max age and time column filter only that source, after the time column is mapped', () => {
	const spl = withSources([{ name: 'a', lookup: 'a.csv', max_age: '30d', time_field: 'Last Seen' }, { name: 'b', lookup: 'b.csv' }]);
	assert.ok(spl.includes(`| eval _time=case(source_lookup="a.csv", tonumber('Last Seen'), true(), _time)`), spl);
	assert.ok(spl.includes('| where (source_lookup!="a.csv" OR isnull(_time) OR _time >= relative_time(now(), "-30d"))'), spl);
	assert.ok(spl.indexOf('tonumber(\'Last Seen\')') < spl.indexOf('relative_time'), 'time mapped before the age filter');
	for (const bad of ['30', 'abc', '0d', '30d) OR (1=1']) assert.throws(() => withSources([{ name: 'a', lookup: 'a.csv', max_age: bad }]), /max age/i, bad);
});

test('row filters wrap the expression so it cannot affect other sources, and must be balanced', () => {
	const spl = withSources([{ name: 'a', lookup: 'a.csv', filter: 'status!="decommissioned"' }, { name: 'b', lookup: 'b.csv', filter: 'like(os, "%win%")' }]);
	assert.ok(spl.includes('| where (source_lookup!="a.csv" OR (status!="decommissioned")) AND (source_lookup!="b.csv" OR (like(os, "%win%")))'), spl);
	for (const bad of ['1=1) OR (1=1', '(a=1', 'x | delete', 'x [search *]']) assert.throws(() => withSources([{ name: 'a', lookup: 'a.csv', filter: bad }]), /row filter|eval expression/i, bad);
});

test('enrich sources mark their rows and carry the flag through the first stats; roles are validated', () => {
	const spl = withSources([{ name: 'a', lookup: 'a.csv' }, { name: 'scan', lookup: 'scan.csv', role: 'enrich' }]);
	assert.ok(spl.includes('| eval adb_auth=case(source_lookup="scan.csv", 0, true(), 1)'), spl);
	assert.ok(spl.includes('max(adb_auth) as adb_auth'), spl);
	assert.ok(!withSources([{ name: 'a', lookup: 'a.csv' }]).includes('adb_auth'), 'no flag without enrich sources');
	assert.throws(() => withSources([{ name: 'a', lookup: 'a.csv', role: 'boss' }]), /role/i);
});

// --- key quality: blocklist and shared-key guard -----------------------------------------

test('the default key blocklist filters every key field before keys are built, but not the stored values', () => {
	const spl = gen([single('mac', { key_field: '1', case_sensitive: '0' }), single('ip', { key_field: '1', case_sensitive: '1' }), single('owner')]);
	assert.ok(/eval adbk_mac = mvfilter\(NOT \(in\(lower\(adbk_mac\), "00:00:00:00:00:00"/.test(spl), spl);
	assert.ok(/adbk_ip = mvfilter\(NOT \(in\(adbk_ip, "00:00:00:00:00:00"/.test(spl), 'case sensitive fields compare exactly');
	assert.ok(spl.indexOf('Remove blocklisted') < spl.indexOf('_key = mvjoin'), 'before the keys are built');
	assert.ok(!/owner = mvfilter/.test(spl) && !/mvfilter\(NOT \(in\(lower\(mac\)/.test(spl), 'the field values themselves are untouched');
	assert.ok(spl.includes('cidrmatch("127.0.0.0/8", adbk_mac)'), spl);
});

test('an explicit key_blocklist replaces the defaults, and an empty one disables the blocklist', () => {
	const withList = (v) => gen([single('mac', { key_field: '1', case_sensitive: '0' })], { name: 'general', content: { lookups: general.content.lookups, key_blocklist: v } });
	const custom = withList(JSON.stringify(['Gateway', 're:^vm-\\d+$', 'cidr:10.9.0.0/16']));
	assert.ok(custom.includes('in(lower(adbk_mac), "gateway") OR match(lower(adbk_mac), "^vm-\\\\d+$") OR cidrmatch("10.9.0.0/16", adbk_mac)'), custom);
	assert.ok(!custom.includes('00:00:00:00:00:00'), 'defaults replaced');
	assert.ok(!withList('[]').includes('Remove blocklisted'), 'empty list: no blocklist step');
	assert.ok(withList('not json').includes('00:00:00:00:00:00'), 'malformed falls back to the defaults');
	assert.throws(() => withList(JSON.stringify(['re:(bad'])), /key blocklist regex/i);
});

test('max_key_share is passed to adbmerge unless it is 0', () => {
	const withShare = (v) => gen([single('mac', { key_field: '1' })], { name: 'general', content: { lookups: general.content.lookups, max_key_share: v } });
	assert.match(withShare(undefined), /\| adbmerge max_keys=25 max_key_share=50\n/);
	assert.match(withShare('200'), /\| adbmerge max_keys=25 max_key_share=200\n/);
	assert.match(withShare('0'), /\| adbmerge max_keys=25\n/);
	assert.match(withShare('abc'), /max_key_share=50\n/);
});

// --- scope (site / tenant) ---------------------------------------------------------------

test('scoped keys are prefixed with the row scope after the blocklist; global keys are not', () => {
	const sources = [{ name: 'paris', lookup: 'p.csv', scope: 'Paris' }, { name: 'dallas', lookup: 'd.csv', scope: 'dallas' }, { name: 'x', lookup: 'x.csv' }];
	const spl = withSources(sources, [single('ip', { key_field: '1', key_scope: 'scoped' }), single('mac', { key_field: '1' })]);
	assert.ok(spl.includes('| eval scope = lower(case(source_lookup="p.csv", "paris", source_lookup="d.csv", "dallas", true(), null()))'), spl);
	assert.ok(spl.includes('adbk_ip = if(isnotnull(scope), mvmap(adbk_ip, scope . "|" . adbk_ip), adbk_ip)'), spl);
	assert.ok(!spl.includes('mvmap(adbk_mac'), 'mac stays global');
	assert.ok(spl.indexOf('Remove blocklisted') < spl.indexOf('Prefix scoped keys'), 'blocklist sees the raw value');
	assert.ok(spl.includes('values(scope) as scope'), spl);
	assert.ok(spl.includes('| table _key, asset, source, source_lookup, last_seen, scope, '), spl);
});

test('a scope column (general scope_field) is used for sources without a fixed scope', () => {
	const cfg = (general) => gen([single('ip', { key_field: '1', key_scope: 'scoped' })], { name: 'general', content: Object.assign({ lookups: JSON.stringify([{ name: 'a', lookup: 'a.csv', scope: 'hq' }, { name: 'b', lookup: 'b.csv' }]) }, general) });
	assert.ok(cfg({ scope_field: 'Site Code' }).includes(`| eval scope = lower(case(source_lookup="a.csv", "hq", true(), 'Site Code'))`));
	assert.throws(() => cfg({ scope_field: "x'y" }), /scope field/i);
	assert.throws(() => gen([single('ip')], { name: 'general', content: { lookups: JSON.stringify([{ name: 'a', lookup: 'a.csv', scope: 'a|b' }]) } }), /scope/i);
});

test('nothing changes without any scope configured', () => {
	const spl = gen([single('ip', { key_field: '1', key_scope: 'scoped' })]);
	assert.ok(!spl.includes('scope'), spl);
});
