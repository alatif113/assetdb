// Explorer page: the asset explorer visualization fed by searches defined in assetdb_explorer.xml (ds_assets and ds_total, which the
// search box narrows, and ds_prov, the sources of the selected asset). The visualization reports the search text and the selection;
// they become the tokens $adb_q$ and $adb_asset$ that the searches use.
// First, on its own and without waiting for the page: the theme check (see adb_theme.js)
require(['../app/assetdb/js/adb_theme.min'], function (Theme) { Theme.follow(); });
require([
	'splunkjs/mvc',
	'../app/assetdb/js/adb_frame.min',
	'splunkjs/mvc/simplexml/ready!',
], function (mvc, Frame) {
	// Searches read the submitted token model; with no input on the page nothing copies the default one into it, so both are set.
	var tokens = mvc.Components.getInstance('default'), submitted = mvc.Components.getInstance('submitted');
	var view = Frame.mount(document.getElementById('adb_explorer'), 'adb_asset_explorer');
	var sources = { primary: null, total: null, provenance: null, names: null }, assetsLoading = true, totalLoading = true, provLoading = false;
	var push = function () {
		var ds = {};
		// The assets and their count come from two searches that run side by side (see build-dashboards.py): the visualization gets the count
		// as the adb_total column of the assets, and nothing is shown until both are in so that the count is never the wrong one.
		var ready = !assetsLoading && !totalLoading;
		if (sources.primary && ready) {
			var data = sources.primary, n = data.columns[0] ? data.columns[0].length : 0;
			if (sources.total !== null) data = { fields: data.fields.concat([{ name: 'adb_total' }]), columns: data.columns.concat([new Array(n).fill(String(sources.total))]) };
			ds.primary = { data: data };
		}
		// provenance.loading tells the visualization the sources of the selected asset are being fetched (it shows a skeleton meanwhile)
		if (sources.provenance) ds.provenance = { data: sources.provenance, loading: provLoading };
		// the configured sources (name and lookup), so a source's logo can be picked from its lookup name too
		if (sources.names) ds.sources = { data: sources.names };
		view.send({ dataSources: ds, loading: assetsLoading || totalLoading });
	};
	Frame.watch(mvc.Components.get('ds_assets'), function (r) { assetsLoading = r.loading; if (r.data) sources.primary = r.data; push(); });
	Frame.watch(mvc.Components.get('ds_total'), function (r) { totalLoading = r.loading; if (r.data && r.data.columns[0] && r.data.columns[0].length) sources.total = r.data.columns[0][0]; push(); });
	Frame.watch(mvc.Components.get('ds_sources'), function (r) { if (r.data) sources.names = r.data; push(); });
	Frame.watch(mvc.Components.get('ds_prov'), function (r) { provLoading = r.loading; if (r.data) sources.provenance = r.data; push(); });
	// An empty token value counts as not set and the searches would never run, so "nothing typed" is * (matches everything) and "no asset" is -.
	var set = function (q, sel) {
		// the key goes into the search as it is, so only what an asset key can contain is let through
		var v = { adb_q: q || '*', adb_asset: String(sel || '').replace(/[^A-Za-z0-9_-]/g, '') || '-' };
		tokens.set(v); submitted.set(v);
	};
	view.onDrill(function (p) { set(p['click.q'], p['click.sel']); });
	set('', '');
	push();
});
