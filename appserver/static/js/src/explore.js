// The Explore dashboard: find an asset by any key value, then see which source supplied each piece of its information.
require([
	'jquery',
	'splunkjs/mvc',
	'../app/assetdb/js/generator.min',
	'splunkjs/mvc/simplexml/ready!',
], function ($, mvc, Generator) {
	const $el = $('#ab_explore');
	const SERVICE = mvc.createService();
	const ENDPOINT = '/servicesNS/nobody/assetdb/configs/conf-assetdb';
	const { safeParse, splQuote } = Generator;
	let fieldArray = [];
	let fieldNames = [];

	const oneshot = (search) =>
		$.when(SERVICE.post('/servicesNS/nobody/assetdb/search/jobs', { search, exec_mode: 'oneshot', output_mode: 'json', count: 0 }).promise()).then(
			(data) => safeParse(Array.isArray(data) ? data[0] : data, {}).results || []
		);

	const asList = (value) => (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]);

	function renderTable(rows, columns, onRow) {
		const $table = $('<table class="table table-striped table-condensed table-hover"></table>');
		$table.append($('<thead></thead>').append($('<tr></tr>').append(columns.map((c) => $('<th></th>').text(c.replace(/_/g, ' '))))));
		const $body = $('<tbody></tbody>');
		rows.forEach((row) => {
			const $tr = $('<tr></tr>').append(columns.map((c) => $('<td></td>').text(asList(row[c]).join(', '))));
			if (onRow) $tr.addClass('adb-clickable').on('click', () => onRow(row, $tr));
			$body.append($tr);
		});
		return $table.append($body);
	}

	/**
	 * The values an analyst's search term can match: the term as typed (lowercase), normalized MAC and short host
	 * name forms, each with the optional scope prefix.
	 */
	function candidates(term, scope) {
		const t = String(term).trim().toLowerCase();
		const out = new Set([t]);
		if (/^[0-9a-f]{2}([^0-9a-f]?[0-9a-f]{2}){5}$/.test(t)) out.add(t.replace(/[^0-9a-f]/g, '').replace(/(..)(?=.)/g, '$1:'));
		if (t.includes('.') && !/^\d+(\.\d+){3}$/.test(t)) out.add(t.split('.')[0]);
		if (t.includes('\\')) out.add(t.split('\\').pop());
		if (t.includes('@')) out.add(t.split('@')[0]);
		const s = String(scope || '').trim().toLowerCase();
		return Array.from(out).map((v) => (s ? `${s}|${v}` : v));
	}

	function findSearch(term, scope) {
		if (term.includes('*')) return `| inputlookup assetdb | search asset=${splQuote(term.trim().toLowerCase())} | head 50`;
		return `| inputlookup assetdb where ${candidates(term, scope).map((c) => `asset=${splQuote(c)}`).join(' OR ')} | head 50`;
	}

	const $find = $('<div class="adb-panel container"><h3>Find an asset</h3></div>');
	const $term = $('<input type="text" class="adb-term" placeholder="Any key value: IP, MAC, host name, user ... (use * for a wildcard)" autocomplete="off">');
	const $scope = $('<input type="text" class="adb-scope" placeholder="Scope (optional)" autocomplete="off">');
	const $go = $('<a href="#" class="btn btn-primary">Search</a>');
	const $results = $('<div class="adb-results"></div>');
	$find.append($('<div class="adb-search-row"></div>').append($term, $scope, $go)).append($results);

	const $detail = $('<div class="adb-panel container"><h3>Source data behind the selected asset</h3><div class="adb-detail help-block">Select an asset above.</div></div>');
	$el.append($find, $detail);

	function explain(asset) {
		const $body = $('.adb-detail', $detail).empty().text('Reading the sources...');
		try {
			const lines = Generator.buildSearchLines(fieldArray);
			const spl = Generator.buildExplainSearch(lines, asList(asset.asset), fieldNames);
			oneshot(spl)
				.done((rows) => {
					$body.empty();
					const sources = new Set(rows.map((r) => r.source));
					$body.append($('<p></p>').text(`${rows.length} source row${rows.length === 1 ? '' : 's'} from ${sources.size} source${sources.size === 1 ? '' : 's'} carry one of this asset's ${asList(asset.asset).length} keys. Each row shows what that source supplied, after normalizing, ignoring and mapping, so every value in the merged asset can be traced to its source.`));
					const columns = ['source', 'source_lookup'].concat(rows.some((r) => r.role) ? ['role'] : [], ['adb_time'], fieldNames);
					$body.append(renderTable(rows, columns));
					$body.append($('<h4 class="adb-group-title"></h4>').text('Merged asset'));
					$body.append(renderTable([asset], ['asset', 'source', 'last_seen'].concat(fieldNames.filter((n) => asset[n] !== undefined))));
				})
				.fail(() => $body.empty().text('The source rows could not be read.'));
		} catch (e) {
			$body.empty().append($('<div class="error-message"></div>').text(e.message));
		}
	}

	function search() {
		const term = $term.val().trim();
		if (!term) return;
		$results.empty().text('Searching...');
		oneshot(findSearch(term, $scope.val()))
			.done((rows) => {
				$results.empty();
				if (!rows.length) {
					return $results.append($('<p class="help-block"></p>').text('No asset has that value as a key. Keys are matched in lowercase and after normalizing; if keys are scoped, enter the scope too.'));
				}
				const shown = ['asset', 'source', 'last_seen'].concat(fieldNames.slice(0, 6));
				const view = rows.map((r) => Object.assign({}, r, { last_seen: r.last_seen ? new Date(parseFloat(r.last_seen) * 1000).toLocaleString() : '' }));
				$results.append($('<p></p>').text(`${rows.length} matching asset${rows.length === 1 ? '' : 's'}. Select one to see its sources.`));
				$results.append(renderTable(view, shown, (row, $tr) => {
					$('tr', $results).removeClass('adb-selected');
					$tr.addClass('adb-selected');
					explain(rows[view.indexOf(row)]);
				}));
				if (rows.length === 1) $('tbody tr', $results).first().trigger('click');
			})
			.fail(() => $results.empty().text('The search failed.'));
	}

	$go.on('click', () => { search(); return false; });
	$term.on('keydown', (e) => { if (e.key === 'Enter') search(); });
	$scope.on('keydown', (e) => { if (e.key === 'Enter') search(); });

	$.when(SERVICE.get(ENDPOINT, { count: 0 }).promise()).done((data) => {
		fieldArray = safeParse(data, {}).entry || [];
		fieldNames = fieldArray.filter((e) => e.name !== 'general').map((e) => e.name);
		const q = new URLSearchParams(window.location.search).get('q');
		if (q) { $term.val(q); search(); }
	});
});
