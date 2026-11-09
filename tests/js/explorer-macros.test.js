'use strict';
// adb_provenance is generated from the configuration by generator.js; adb_icon is written by the user (default/macros.conf).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { parseMacros, expandMacros } = require('./macros');
const PROV_STEPS = /^adb_prov_(match|end)$/;   // what adb_provenance shares between its sources (macros.conf)
const { pathToFileURL } = require('node:url');
const { loadGenerator } = require('./load-generator');
const G = loadGenerator();
const plain = (x) => JSON.parse(JSON.stringify(x));   // values built inside the generator's vm context have another Array prototype

const field = (name, content = {}) => ({ name, content: Object.assign({ key_field: '0', field_type: 'single' }, content) });
const general = (lookups, extra = {}) => ({ name: 'general', content: Object.assign({ lookups: JSON.stringify(lookups) }, extra) });

test('adb_icon is a macro the user writes: it ships with the default icon and says which outputs are allowed', () => {
	const macros = parseMacros();
	assert.equal(macros.adb_icon.definition, 'eval adb_icon="other"');
	const conf = fs.readFileSync(path.join(__dirname, '..', '..', 'default', 'macros.conf'), 'utf8');
	const doc = conf.slice(conf.indexOf('# `adb_icon`'), conf.indexOf('[adb_icon]'));
	G.ICON_CHOICES.forEach((n) => assert.ok(doc.includes(n), `the macro's comment lists the icon "${n}"`));
	assert.ok(!('buildIconMacro' in G), 'the macro is no longer generated');
});

test('adb_icon can only produce the icons the visualization can draw', async () => {
	const { ICON_NAMES } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'viz', 'shared', 'icons.mjs')).href);
	assert.deepEqual(plain(G.ICON_CHOICES), ICON_NAMES);
});

test('adb_provenance: a stub with the right columns when nothing is configured', () => {
	const m = G.buildProvenanceMacro([general([])]);
	assert.equal(m.args, 'key');
	assert.ok(/eval source=null\(\), field=null\(\), value=null\(\), seen=null\(\), adb_key=null\(\)/.test(m.definition));
	assert.ok(!/\$key\$/.test(m.definition));
});

test('adb_provenance: each enabled source is read, mapped, filtered and matched on the asset keys', () => {
	const cfg = [
		general([
			{ name: 'cmdb', lookup: 'cmdb.csv', columns: { owner: 'Owner Name' }, time_field: 'updated', filter: 'status="active"', max_age: '90d' },
			{ name: 'off', lookup: 'off.csv', enabled: false },
			{ name: 'dhcp', lookup: 'dhcp.csv' },
		]),
		field('mac', { key_field: '1', field_type: 'multivalue' }), field('ip', { key_field: '1', field_type: 'multivalue' }),
		field('owner'), field('hidden', { enabled: '0' }), field('tags', { field_type: 'multivalue' }),
	];
	const raw = G.buildProvenanceMacro(cfg).definition, m = expandMacros(raw, parseMacros(), PROV_STEPS);
	assert.equal((raw.match(/`adb_prov_match\(/g) || []).length, 2, 'one shared match step per source, not a copy of its SPL');
	assert.equal((raw.match(/`adb_prov_end\(/g) || []).length, 2);
	assert.ok(!raw.includes('mvexpand asset') && !raw.includes('| search ['), 'the key match is not repeated in the macro');
	assert.ok(raw.includes('`adb_prov_match($key$, "mac, ip")`') && raw.includes('`adb_prov_end("dhcp", tonumber(_time), "mac ip owner tags")`') && raw.includes('`adb_prov_end("cmdb", adb_seen, "mac ip owner tags")`'), raw);
	assert.ok(m.startsWith('makeresults count=1 | where 1=0 | append [| inputlookup cmdb.csv | where (status="active") | eval adb_seen=tonumber(\'updated\')'), m);
	assert.ok(m.includes("| eval owner='Owner Name'"), 'the column mapping is applied');
	assert.ok(m.includes('| where isnull(adb_seen) OR adb_seen >= relative_time(now(), "-90d")'), 'row filter, time column and max age in the order of the merge, before the column mapping');
	assert.ok(m.indexOf('relative_time') < m.indexOf("| eval owner='Owner Name'"));
	assert.ok(m.includes('| eval adb_k=mvappend(mac, ip)') && !m.includes('lower(adb_k)'), 'search is case-insensitive: no lowercasing of every row');
	assert.ok(m.includes('| foreach mac, ip, tags [eval <<FIELD>>=split(<<FIELD>>, "|")]'), 'multivalue fields are split like the merge does');
	assert.ok(m.includes('| eval adb_source="dhcp", adb_seen=tonumber(_time)'), 'a source without a time column falls back to _time');
	assert.ok(m.indexOf('| search [') < m.indexOf('| eval adb_source="dhcp"'), 'the source name and time are added after the key match, so only to the rows that match');
	assert.ok(m.includes('| eval adb_source="cmdb", adb_seen=adb_seen'), 'a source with a max age has its time computed before the match');
	assert.ok(!m.includes('off.csv'), 'disabled sources are skipped');
	assert.ok(!/hidden/.test(m), 'disabled fields are skipped');
	assert.equal((m.match(/where _key="\$key\$"/g) || []).length, 2, 'one key match per source');
	assert.equal((m.match(/\$key\$/g) || []).length, 3, 'and once more to stamp the rows with the asset');
	assert.ok(m.includes('| fields adb_source adb_seen mac ip owner tags]'));
	assert.ok(!m.includes('eventstats') && m.includes('| stats values(*) as *, max(adb_seen) as adb_max by adb_source | eval adb_seen=adb_max'), 'one stats instead of eventstats plus stats');
	assert.ok(m.endsWith('| rename adb_source as source | eval adb_key="$key$" | table source field value seen adb_key'));
	G.checkBalancedParens(m.replace(/"(?:[^"\\]|\\.)*"/g, '""'));
});

test('adb_provenance: a single key field is not wrapped in mvappend, and bad names are refused', () => {
	const one = expandMacros(G.buildProvenanceMacro([general([{ name: 's', lookup: 's.csv' }]), field('mac', { key_field: '1' }), field('owner')]).definition, parseMacros(), PROV_STEPS);
	assert.ok(one.includes('| eval adb_k=mvappend(mac) | search ['), one);
	assert.throws(() => G.buildProvenanceMacro([general([{ name: 's', lookup: 'a b.csv' }]), field('mac', { key_field: '1' })]), /Invalid lookup/);
	assert.throws(() => G.buildProvenanceMacro([general([{ name: 's', lookup: 's.csv', columns: { owner: "x'y" } }]), field('mac', { key_field: '1' }), field('owner')]), /Invalid column/);
	assert.throws(() => G.buildProvenanceMacro([general([{ name: 's', lookup: 's.csv', filter: 'a | b' }]), field('mac', { key_field: '1' })]), /Invalid eval/);
});

test('adb_provenance: the macro quotes the key itself, because Splunk strips the quotes of a quoted macro argument', () => {
	const raw = G.buildProvenanceMacro([general([{ name: 'a', lookup: 'a.csv' }]), field('mac', { key_field: '1' })]).definition, m = expandMacros(raw, parseMacros(), PROV_STEPS);
	assert.ok(m.includes('where _key="$key$"') && m.includes('eval adb_key="$key$"'), m);
	assert.ok(!/[^"]\$key\$[^"]/.test(m.replace(/adb_prov_match\(\$key\$/g, '')), 'no unquoted $key$: ' + m);
	assert.ok(raw.includes('`adb_prov_match($key$,'), 'the key goes to the shared macro bare (a quoted argument would lose its quotes) and the macro quotes it');
	assert.ok(parseMacros()['adb_prov_match(2)'].definition.includes('_key="$key$"'));
	const xml = fs.readFileSync(path.join(__dirname, '..', '..', 'default', 'data', 'ui', 'views', 'assetdb_explorer.xml'), 'utf8');
	assert.ok(xml.includes('`adb_provenance($adb_asset$)`') && !/adb_provenance\(.*\|s/.test(xml), 'the dashboard passes the key without quotes');
});
