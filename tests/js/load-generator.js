'use strict';
// Loads makeMergeSearch()/getLookupArray() out of the browser-only AMD module
// appserver/static/js/src/assetdb.js without modifying it.
//
// assetdb.js wraps everything in `require([...deps], function (...) {...})` and ends
// with `buildContent();`. We evaluate the real source in a vm sandbox with a fake AMD
// `require` that hands the callback stubs for jQuery/Splunk MVC (real underscore is
// used because the generator calls _.escape), and inject an export just before the
// trailing buildContent() call.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const underscore = require('underscore');

const SRC_DIR = path.join(__dirname, '..', '..', 'appserver', 'static', 'js', 'src');
const SRC = path.join(SRC_DIR, 'assetdb.js');

// The generator is a pure AMD module (define([], fn)); evaluate it for real.
function loadGenerator() {
	let exported;
	const file = path.join(SRC_DIR, 'generator.js');
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), { define: (deps, fn) => { exported = fn(); } }, { filename: file });
	return exported;
}

// Callable, indexable no-op that absorbs any jQuery / Splunk UI call.
const noop = new Proxy(function () {}, {
	get: (_t, prop) => (prop === Symbol.toPrimitive ? () => '' : noop),
	apply: () => noop,
	construct: () => noop,
});

function load({ confEntries = [] } = {}) {
	let source = fs.readFileSync(SRC, 'utf8');
	if (!source.includes('module.exports')) {
		const tail = /(\n\tinit\(\);\s*\n\}\);\s*)$/;
		if (!tail.test(source)) throw new Error('assetdb.js no longer ends with init(); update load-generator.js');
		// searchText/searchLines are the pure, synchronous builders behind the page's makeMergeSearch()/makeMergeSearchLines()
		source = source.replace(tail, '\n\tmodule.exports = { makeMergeSearch: searchText, makeMergeSearchLines: searchLines, getLookupArray, isReservedFieldName, describeError, checkEvalExpression };$1');
	}

	// Synchronous stand-in for jQuery deferreds: $.when(x).then(cb) => cb(x).
	const $ = function () { return noop; };
	$.when = (value) => ({
		then: (cb) => cb(value),
		done: function () { return this; },
		always: function () { return this; },
		fail: function () { return this; },
	});

	// getConf() resolves to the JSON body of the conf-assetdb REST endpoint.
	const service = { get: () => ({ promise: () => JSON.stringify({ entry: confEntries }) }), post: () => noop, del: () => noop };
	const mvc = { createService: () => service };

	const sandbox = { module: { exports: {} }, console, document: noop, window: noop, CSS: { escape: (x) => x }, getComputedStyle: () => ({ backgroundColor: '' }) };
	// Hand each dependency its stub by name, so adding or reordering modules in assetdb.js cannot misalign the arguments.
	sandbox.require = (deps, fn) => fn(...deps.map((dep) => {
		if (dep === 'underscore') return underscore;
		if (dep === 'jquery') return $;
		if (dep === 'splunkjs/mvc') return mvc;
		if (/generator\.min$/.test(dep)) return loadGenerator();
		return noop;
	}));
	vm.runInNewContext(source, sandbox, { filename: SRC });
	// With no field array the page reads the config from the server; here that is confEntries.
	const exp = sandbox.module.exports;
	const withConf = (fn) => (fieldArray = []) => fn(fieldArray.length ? fieldArray : confEntries);
	return Object.assign({}, exp, { makeMergeSearch: withConf(exp.makeMergeSearch), makeMergeSearchLines: withConf(exp.makeMergeSearchLines) });
}

module.exports = { load, loadGenerator };
