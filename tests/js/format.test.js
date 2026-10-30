'use strict';
// format.js turns SPL (which embeds user supplied config values) into HTML; make sure
// nothing user controlled can come out as markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const underscore = require('underscore');

const SRC = path.join(__dirname, '..', '..', 'appserver', 'static', 'js', 'src');

function loadAmd(file, deps) {
	let exported;
	const sandbox = { console, define: (...args) => {
		const fn = args[args.length - 1];
		exported = fn(...deps);
	} };
	vm.runInNewContext(fs.readFileSync(path.join(SRC, file), 'utf8'), sandbox, { filename: file });
	return exported;
}

const Prism = loadAmd('prism.js', []);
const format = loadAmd('format.js', [Prism, (html) => html, underscore]);

test('format escapes markup inside SPL values', () => {
	const html = format('| inputlookup x | eval a=if(match(b, "<img src=x onerror=alert(1)>"), "<script>alert(2)</script>", "&")');
	assert.ok(!/<img/i.test(html), html);
	assert.ok(!/<script/i.test(html), html);
	assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), html);
	assert.ok(html.includes('&lt;script&gt;'), html);
});

test('format escapes markup inside comments and field names', () => {
	const html = format('```<b onmouseover=x>``` | table "><svg onload=x>');
	assert.ok(!/<b /i.test(html), html);
	assert.ok(!/<svg/i.test(html), html);
});

test('format still produces highlighted spans and rows', () => {
	const html = format('| inputlookup foo | stats count by bar');
	assert.match(html, /<span class="row">/);
	assert.match(html, /<span class="[a-z-]+">/);
});
