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

const SRC = path.join(__dirname, '..', '..', 'appserver', 'static', 'js', 'src', 'assetdb.js');

// Callable, indexable no-op that absorbs any jQuery / Splunk UI call.
const noop = new Proxy(function () {}, {
	get: (_t, prop) => (prop === Symbol.toPrimitive ? () => '' : noop),
	apply: () => noop,
	construct: () => noop,
});

function load({ confEntries = [] } = {}) {
	let source = fs.readFileSync(SRC, 'utf8');
	if (!source.includes('module.exports')) {
		const tail = /(\n\tbuildContent\(\);\s*\n\}\);\s*)$/;
		if (!tail.test(source)) throw new Error('assetdb.js no longer ends with buildContent(); update load-generator.js');
		source = source.replace(tail, '\n\tmodule.exports = { makeMergeSearch, getLookupArray, isReservedFieldName, formatIgnoreValues, describeError, checkEvalExpression };$1');
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

	const sandbox = { module: { exports: {} }, console };
	sandbox.require = (deps, fn) => fn(underscore, $, mvc, noop, noop, noop, noop, noop, noop, noop, noop);
	vm.runInNewContext(source, sandbox, { filename: SRC });
	return sandbox.module.exports;
}

module.exports = { load };
