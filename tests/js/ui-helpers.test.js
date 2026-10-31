'use strict';
// Pure helpers used by the Configure page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-generator');

const h = load();

test('reserved field names include general and the default/Splunk fields, case-insensitively', () => {
	for (const n of ['general', 'GENERAL', 'asset', 'source', 'source_lookup', '_key', '_time', 'host', 'index']) {
		assert.equal(h.isReservedFieldName(n), true, n);
	}
	for (const n of ['nt_host', 'mac', 'owner']) assert.equal(h.isReservedFieldName(n), false, n);
});

test('describeError extracts a Splunk message, falls back to the HTTP status', () => {
	assert.equal(h.describeError({ data: { messages: [{ text: 'Insufficient permission' }] } }), 'Insufficient permission');
	assert.equal(h.describeError({ responseText: '{"messages":[{"text":"boom"}]}' }), 'boom');
	assert.equal(h.describeError({ status: 403 }), 'request failed with HTTP status 403');
	assert.equal(h.describeError(new Error('Invalid field name "x"')), 'Invalid field name "x"');
	assert.equal(h.describeError(undefined), 'request failed');
});

test('assetdb.js no longer logs to the console or ships a sourceURL pragma', () => {
	const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'appserver', 'static', 'js', 'src', 'assetdb.js'), 'utf8');
	assert.ok(!/console\.log/.test(src));
	assert.ok(!/sourceURL/.test(src));
	assert.ok(!/<\/td>'\}/.test(src), 'stray \'} in row templates');
});

