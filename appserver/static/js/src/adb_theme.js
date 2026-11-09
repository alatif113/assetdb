// Dark is the default theme of the AssetDB pages: their XML says theme="dark", so Splunk renders them dark from the very first paint
// (no flash for the default). A page is switched to the light theme only for a user who chose light in their Splunk preferences: this
// reads the preference and, if it is "light", reloads the page once with ?theme=light, which Splunk honours over the XML. (Splunk Web
// themes a Simple XML page only from the XML or a ?theme= parameter, never from the user's preference or supported_themes in app.conf:
// see get_dashboard_theme in Splunk's view controller.) A URL that already has a theme is left alone, so this can never loop and an
// explicit ?theme= still wins.
//
// A light user sees the dark page first: Splunk paints before any script of an app can run (about 0.4 s into the load, measured), and that
// stretch cannot be shortened from an app. The old page is covered with the new page's color while the reload happens. The last
// preference seen is kept in localStorage, so after the first visit the reload starts at once instead of waiting for Splunk's answer.
// Deliberately free of dependencies, so it can run as soon as it is loaded.
define([], function () {
	var CACHE = 'assetdb.theme.pref';

	function pageTheme() {
		var t = window.__splunk_page_theme__ || (window.$C && window.$C.SPLUNK_UI_THEME);
		return /dark/i.test(String(t || '')) ? 'dark' : 'light';
	}

	/** 'light' only when the user chose light; dark (the default of these pages) for dark and for the system default. */
	function wanted(pref) { return pref === 'light' ? 'light' : 'dark'; }

	// The old page stays on screen until the reloaded one paints. Cover it at once with the new page's color, so the old theme is not
	// shown for that second as well.
	function cover(theme) {
		var d = document.createElement('div');
		d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:' + (theme === 'dark' ? '#171d21' : '#f2f4f5');
		(document.body || document.documentElement).appendChild(d);
	}

	function reloadAs(theme) {
		cover(theme);
		var sep = window.location.search ? '&' : '?';
		window.location.replace(window.location.pathname + window.location.search + sep + 'theme=' + theme + window.location.hash);
	}

	function cached() { try { return window.localStorage.getItem(CACHE); } catch (e) { return null; } }
	function remember(pref) { try { window.localStorage.setItem(CACHE, pref); } catch (e) { /* private mode: no cache */ } }

	function follow() {
		if (/[?&]theme=/.test(window.location.search)) return;
		var known = cached();
		if (known) {                       // decide now; the answer from Splunk below only refreshes the cache (or corrects it)
			if (wanted(known) !== pageTheme()) { reloadAs(wanted(known)); return; }
		}
		var C = window.$C || {};
		var url = (C.MRSPARKLE_ROOT_PATH || '') + (C.SPLUNKD_PATH || '/splunkd/__raw') + '/servicesNS/' + encodeURIComponent(C.USERNAME || '-') + '/user-prefs/data/user-prefs/general?output_mode=json';
		window.fetch(url, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				var pref = (((data.entry || [])[0] || {}).content || {}).theme || 'default_system_theme';
				remember(pref);
				if (wanted(pref) !== pageTheme()) reloadAs(wanted(pref));
			})
			.catch(function () { /* the page keeps the theme it has */ });
	}

	return { follow: follow, pageTheme: pageTheme };
});
