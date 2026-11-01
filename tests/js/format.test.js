'use strict';
// format.js colours the lines produced by makeMergeSearchLines. Tokenizing is pure, so test it directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('./load-generator');

const SRC = path.join(__dirname, '..', '..', 'appserver', 'static', 'js', 'src', 'format.js');
let format;
vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), { define: (deps, fn) => { format = fn(() => ({})); } }, { filename: SRC });
const tok = (text, kind = 'command') => JSON.parse(JSON.stringify(format.tokenize({ kind, text })));
const types = (text) => tok(text).filter((t) => t.type !== 'default').map((t) => `${t.type}:${t.text}`);

test('tokens always concatenate back to the original line, whatever it contains', () => {
	for (const text of ['| eval a=if(match(b, "<img src=x onerror=alert(1)>"), "<script>x</script>", "&")', '| stats count by _key', '| `input_adb_lookup(a.csv)`', '| foreach a, b [eval <<FIELD>>=split(<<FIELD>>, "|")]', '| eval a="unterminated', '']) {
		assert.equal(tok(text).map((t) => t.text).join(''), text);
	}
});

test('markup stays inside string tokens as plain text (rendered with .text())', () => {
	const t = tok('| eval a="<script>alert(1)</script>"').find((x) => x.type === 'string');
	assert.equal(t.text, '"<script>alert(1)</script>"');
});

test('commands, strings, functions, operator words and arguments are typed', () => {
	assert.deepEqual(types('| stats values(a) as b by _key'), ['operator:|', 'keyword:stats', 'function:values', 'operator-word:as', 'operator-word:by']);
	assert.deepEqual(types('| adbmerge max_keys=25'), ['operator:|', 'keyword:adbmerge', 'argument:max_keys']);
	assert.deepEqual(types('| eval x = if(isnull(y), "z", y)'), ['operator:|', 'keyword:eval', 'function:if', 'function:isnull', 'string:"z"']);
	assert.deepEqual(types('| `input_adb_lookup(a.csv)`'), ['operator:|', 'keyword:`input_adb_lookup(a.csv)`']);
});

test('comment lines are a single comment token', () => {
	assert.deepEqual(tok('```### Output ###```', 'comment'), [{ type: 'comment', text: '```### Output ###```' }]);
});

test('makeMergeSearchLines yields typed lines whose text is exactly makeMergeSearch', () => {
	const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'configs', 'multi_lookups_keys.json'), 'utf8'));
	const h = load();
	const lines = JSON.parse(JSON.stringify(h.makeMergeSearchLines(cfg.fieldArray)));
	assert.ok(lines.every((l) => l.kind === 'comment' ? /^```### .* ###```$/.test(l.text) : l.text.startsWith('| ')));
	assert.ok(lines.every((l) => !l.text.includes('\n')));
	assert.equal(lines.map((l) => l.text).join('\n'), h.makeMergeSearch(cfg.fieldArray));
});
