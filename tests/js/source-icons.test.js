'use strict';
// The logo next to a source in the Explorer and Coverage visualizations: from the source name and, when the dashboard supplies the
// configured sources, from the name of its lookup too.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'viz', 'shared', 'source-icons.mjs')).href);

test('lookupMap reads the name and lookup columns, and is empty without them', async () => {
	const { lookupMap } = await load();
	assert.deepEqual(lookupMap({ fields: [{ name: 'name' }, { name: 'lookup' }], columns: [['Falcon', 'Endpoints'], ['assetdb_src_crowdstrike.csv', 'assetdb_src_x.csv']] }), { Falcon: 'assetdb_src_crowdstrike.csv', Endpoints: 'assetdb_src_x.csv' });
	assert.deepEqual(lookupMap({ fields: [{ name: 'a' }], columns: [['x']] }), {});
	assert.deepEqual(lookupMap(null), {});
	assert.deepEqual(lookupMap({ fields: [{ name: 'name' }, { name: 'lookup' }], columns: [[['A']], [['b.csv']]] }), { A: 'b.csv' });   // multivalue cells
});

test('sourceIcon uses the name, then the lookup name, and falls back to the default icon', async () => {
	const { sourceIcon } = await load();
	const lk = { Endpoints: 'assetdb_src_tenable.csv' };
	assert.match(sourceIcon('CrowdStrike', {}, 'light', 14), /<img class="vicon"/);
	assert.match(sourceIcon('Endpoints', lk, 'light', 14), /<img class="vicon"/, 'the lookup name says Tenable');
	assert.match(sourceIcon('Endpoints', {}, 'light', 14), /vdefault/, 'nothing to go on');
	assert.match(sourceIcon('Splunk hosts', undefined, 'dark', 14), /vdefault/);
	assert.notEqual(sourceIcon('Endpoints', lk, 'light', 14), sourceIcon('Endpoints', {}, 'light', 14));
});
