// Shared by the Explorer and Coverage pages: puts one of the AssetDB visualizations (appserver/static/js/classic/<name>.min.js, built from
// viz/) in an iframe and feeds it. The page sends the search results, the options and the theme by postMessage; the visualization
// sends back its drilldown events (see viz/shared/classic-host.mjs for its side).
define(['require'], function (require) {
	var toUrl = function (path) { return require.toUrl(path); };
	/** The user's Splunk theme: 'dark' or 'light'. Splunk Web sets window.__splunk_page_theme__ ('dark' or 'enterprise'). */
	function theme() {
		var t = window.__splunk_page_theme__ || (window.$C && window.$C.SPLUNK_UI_THEME);
		return /dark/i.test(String(t || '')) ? 'dark' : 'light';
	}

	/**
	 * Where the built visualization is served. Splunk wraps a script served from /static/app/... in a call a plain page does not
	 * have (i18n_register), but not one served from the versioned /static/@<build>/app/... path RequireJS used to load this very
	 * module.
	 */
	function classicUrl(name) {
		// relative to this module, which is in appserver/static/js next to the classic folder
		// (Splunk wraps a script it serves from an app in a call a plain page does not have, i18n_register, unless it is under js/)
		return toUrl('./classic/' + name + '.min').replace(/(\.js)?(\?.*)?$/, '.js$2');
	}

	/**
	 * Mount a visualization in `el`. Returns { send(partial), onDrill(cb) }. `send` merges {dataSources, loading, options, theme}
	 * into what the visualization has been told so far; messages sent before it is ready are held and delivered when it is.
	 */
	function mount(el, name) {
		var base = classicUrl(name);
		var frame = document.createElement('iframe');
		frame.title = name.replace(/^adb_/, '').replace(/_/g, ' ');
		frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent';
		frame.setAttribute('srcdoc', '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent}#root{height:100%}</style></head><body><div id="root"></div><script src="' + base + '"></script></body></html>');
		var state = { adb: 'state', theme: theme(), options: {} };
		var ready = false, drill = function () {};
		function post() { if (ready && frame.contentWindow) frame.contentWindow.postMessage(state, window.location.origin); }
		window.addEventListener('message', function (e) {
			if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
			if (e.data.adb === 'ready') { ready = true; Array.prototype.forEach.call(el.querySelectorAll('.adb-ph'), function (n) { n.remove(); }); post(); } else if (e.data.adb === 'drill') drill(e.data.payload || {});
		});
		el.appendChild(frame);
		return {
			send: function (partial) { Object.assign(state, partial); post(); },
			onDrill: function (cb) { drill = cb; },
		};
	}

	/**
	 * Call `cb({ loading, data })` as a search runs. `data` is { fields: [{name}], columns: [[...]] } (a multivalue cell is an array),
	 * the shape the Dashboard Studio host gives a visualization, or null while there is nothing.
	 */
	function watch(manager, cb) {
		var results = manager.data('results', { output_mode: 'json_cols', count: 0 });
		var shape = function (d) { return d && d.fields ? { fields: d.fields.map(function (f) { return { name: typeof f === 'string' ? f : f.name }; }), columns: d.columns || [] } : null; };
		manager.on('search:start', function () { cb({ loading: true, data: null }); });
		manager.on('search:failed search:error', function () { cb({ loading: false, data: null }); });
		results.on('data', function () { cb({ loading: false, data: results.hasData() ? shape(results.data()) : { fields: [], columns: [] } }); });
	}

	return { theme: theme, mount: mount, watch: watch };
});
