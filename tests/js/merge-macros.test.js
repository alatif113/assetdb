'use strict';
// The merge search is built from what the configuration decides and from static steps that live in default/macros.conf. These tests keep
// the two in step: every macro the generated search calls exists with the right number of arguments, the counters list is one list, and
// a static macro never contains anything that belongs to a configuration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, loadGenerator } = require('./load-generator');
const { parseMacros, expandMacros, splitArgs } = require('./macros');

const macros = parseMacros();
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'configs');
const STEPS = ['adb_counters', 'adb_tag_time(1)', 'adb_map_column(3)', 'adb_newest_first(1)', 'adb_merge(2)', 'adb_save_overflow', 'adb_run_guard(1)', 'adb_record_run(2)', 'adb_write_gate', 'adb_key_blocklist(1)', 'adb_key_blocklist_cs(1)'];

test('every merge step is defined once, with its arguments', () => {
	for (const name of STEPS) assert.ok(macros[name] && macros[name].definition, `${name} is in macros.conf`);
	assert.deepEqual(macros['adb_merge(2)'].args, ['max_keys', 'max_key_share']);
	assert.deepEqual(macros['adb_record_run(2)'].args, ['min_ratio', 'runs_to_keep']);
});

test('the generated search only calls macros that exist, with the right argument count', () => {
	for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))) {
		const cfg = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
		const spl = load({ confEntries: cfg.confEntries }).makeMergeSearch(cfg.fieldArray);
		for (const [, name, args] of spl.matchAll(/`([a-z_0-9]+)(?:\(([^`]*)\))?`/g)) {
			const n = args === undefined ? 0 : splitArgs(args).length;
			assert.ok(macros[n ? `${name}(${n})` : name], `${file}: \`${name}\` with ${n} argument(s) is not in macros.conf`);
		}
		assert.ok(!/\$[a-z_]+\$/.test(expandMacros(spl)), `${file}: a macro argument was left unreplaced`);
	}
});

test('the counters macro lists exactly the run counters of the generator', () => {
	const listed = [...macros.adb_counters.definition.matchAll(/max\((\w+)\) as (\w+)/g)].map((m) => { assert.equal(m[1], m[2]); return m[1]; });
	assert.deepEqual(listed, JSON.parse(JSON.stringify(loadGenerator().RUN_COUNTERS)));
});

test('a static macro names nothing of the configuration', () => {
	// reserved names and the helper fields of the merge are fine; a lookup, a source or a user field is not
	for (const name of STEPS) {
		const def = macros[name].definition;
		assert.ok(!/\.csv|source_lookup="[^$]/.test(def), `${name} names a lookup`);
		assert.ok(!/\b(mac|nt_host|ip|dns|owner)\b/.test(def.replace(/"[^"]*"/g, '')), `${name} names a user field`);
		assert.ok(!def.includes('\\'), `${name} has a backslash (macro escaping differs between Splunk versions); use a character class instead`);
	}
});

test('the default key blocklist macros are exactly what the generator would otherwise write out', () => {
	const g = loadGenerator();
	const def = JSON.parse(JSON.stringify(g.DEFAULT_KEY_BLOCKLIST));
	assert.equal(expandMacros('`adb_key_blocklist(adbk_mac)`'), g.valueFilter('adbk_mac', def, false, 'key blocklist'));
	assert.equal(expandMacros('`adb_key_blocklist_cs(adbk_mac)`'), g.valueFilter('adbk_mac', def, true, 'key blocklist'));
});

test('a customized key blocklist is written out, the default one is the macro', () => {
	const cfg = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'multi_lookups_keys.json'), 'utf8'));
	const withList = (list) => {
		const fa = JSON.parse(JSON.stringify(cfg.fieldArray)); const gen = fa.find((e) => e.name === 'general');
		if (list) gen.content.key_blocklist = JSON.stringify(list); else delete gen.content.key_blocklist;
		return load({ confEntries: cfg.confEntries }).makeMergeSearch(fa);
	};
	const dflt = withList(null);
	assert.ok(dflt.includes('`adb_key_blocklist(adbk_mac)`') && !dflt.includes('in(lower(adbk_mac)'), dflt);
	const custom = withList(['unknown', 're:^x$']);
	assert.ok(!custom.includes('adb_key_blocklist') && custom.includes('in(lower(adbk_mac), "unknown")'), custom);
	assert.ok(!withList([]).includes('blocklist'), 'an empty list removes the step');
});

test('the unexpanded search reads as named steps', () => {
	const cfg = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'multi_lookups_keys.json'), 'utf8'));
	const spl = load({ confEntries: cfg.confEntries }).makeMergeSearch(cfg.fieldArray);
	for (const call of ['`adb_merge(25, 50)`', '`adb_save_overflow`', '`adb_run_guard(0.5)`', '`adb_record_run(0.5, 200)`', '`adb_write_gate`', '`adb_newest_first(mac)`']) assert.ok(spl.includes(call), call);
	assert.ok(!spl.includes('| adbmerge') && !spl.includes('adb_rid') && !spl.includes('adb_is_marker'), 'the implementation is in the macros');
});
