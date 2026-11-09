// Coverage page: the heatmap visualization fed by the search ds_cov in assetdb_coverage.xml. A click on a cell opens a search of
// that group's assets (and whether the source covers each) in a new window.
// First, on its own and without waiting for the page: the theme check (see adb_theme.js)
require(['../app/assetdb/js/adb_theme.min'], function (Theme) { Theme.follow(); });
require([
	'splunkjs/mvc',
	'splunk.util',
	'../app/assetdb/js/adb_frame.min',
	'../app/assetdb/js/generator.min',
	'splunkjs/mvc/simplexml/ready!',
], function (mvc, SplunkUtil, Frame, Generator) {
	var tokens = mvc.Components.getInstance('default');
	var ALL = 'All assets';
	var view = Frame.mount(document.getElementById('adb_coverage'), 'adb_heatmap');
	view.send({ options: { allLabel: ALL } });
	var cov = { primary: null, sources: null, loading: true };
	var push = function () {
		var ds = {};
		if (cov.primary) ds.primary = { data: cov.primary };
		if (cov.sources) ds.sources = { data: cov.sources };   // the configured sources (name and lookup), for the logo of each column
		view.send({ dataSources: ds, loading: cov.loading });
	};
	Frame.watch(mvc.Components.get('ds_cov'), function (r) { cov.primary = r.data; cov.loading = r.loading; push(); });
	Frame.watch(mvc.Components.get('ds_sources'), function (r) { if (r.data) cov.sources = r.data; push(); });
	view.onDrill(function (p) {
		var group = p['row.Group.value'], source = p.name;
		if (!group || !source) return;
		var spl = Generator.buildCoverageDrillSearch(tokens.get('cov_by'), group, source, ALL);
		var url = SplunkUtil.make_url('/app/search/search') + '?q=' + encodeURIComponent(spl) + '&earliest=0&latest=';
		window.open(url, '_blank', 'noopener');
	});
});
