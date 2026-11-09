// Stands in for @splunk/dashboard-studio-extension when a visualization is built for a classic (Simple XML) dashboard.
// The visualization runs in an iframe the page creates (appserver/static/js/src/adb_frame.js) and talks to it by
// postMessage: the page sends the search results, the options and the theme; the visualization sends its drilldown events
// back. The listener API is the same one the Studio host offers, so the visualizations do not know which host they have.
// A srcdoc iframe has the page's origin but its own location says "null", so the page's origin is read from the parent.
const pageOrigin = () => window.parent.location.origin;
const listeners = { ds: [], opt: [], theme: [] };
const last = { ds: { dataSources: {}, loading: true }, opt: { options: {} }, theme: { theme: 'light' } };
const add = (kind, cb, o) => { listeners[kind].push(cb); if (o && o.invokeImmediately) cb(last[kind]); };

window.addEventListener('message', (e) => {
	const m = e.data;
	if (e.source !== window.parent || e.origin !== pageOrigin() || !m || m.adb !== 'state') return;
	if (m.dataSources) { last.ds = { dataSources: m.dataSources, loading: !!m.loading }; listeners.ds.forEach((cb) => cb(last.ds)); }
	if (m.options) { last.opt = { options: m.options }; listeners.opt.forEach((cb) => cb(last.opt)); }
	if (m.theme) { last.theme = { theme: m.theme }; listeners.theme.forEach((cb) => cb(last.theme)); }
});

export const VisualizationAPI = {
	addDataSourcesListener: (cb, o) => add('ds', cb, o),
	addOptionsListener: (cb, o) => add('opt', cb, o),
	addThemeListener: (cb, o) => add('theme', cb, o),
	triggerDrilldown: (ev) => window.parent.postMessage({ adb: 'drill', payload: (ev && ev.payload) || {} }, pageOrigin()),
};
// Tell the page the visualization is listening, so it sends the first state.
window.parent.postMessage({ adb: 'ready' }, pageOrigin());
