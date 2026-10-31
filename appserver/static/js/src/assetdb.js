require([
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/utils',
	'../app/assetdb/js/format.min',
	'../app/assetdb/js/generator.min',
	'splunkjs/mvc/simplexml/ready!',
], function ($, mvc, MvcUtils, format, Generator) {
	const host = document.getElementById('ab_config');
	const SERVICE = mvc.createService();
	const { safeParse, checkEvalExpression, isReservedFieldName, getLookupArray, FIELD_NAME_RE } = Generator;
	const ENDPOINT_BASE = '/servicesNS/nobody/assetdb/configs/';
	const VALIDATION_ENDPOINT = '/services/search/v2/parser';
	const COLLECTION_ENDPOINT = '/servicesNS/nobody/assetdb/storage/collections/config/assetdb';
	const ENRICH_MACRO_ENDPOINT = '/servicesNS/nobody/assetdb/data/macros/adb_enrich_outputs';
	const JOBS = '/servicesNS/nobody/assetdb/search/jobs';
	const SAVED = 'conf-savedsearches/assetdb-lookupgen';
	// KV store allows 10 accelerations per collection; one is taken by `asset`.
	const MAX_KEY_ACCELERATIONS = 9;
	const CRON_RE = /^\s*([-\d*/,?A-Za-z]+\s+){4}[-\d*/,?A-Za-z]+\s*$/;
	const NORMALIZER_CHOICES = [
		['none', 'None'],
		['trim', 'Trim whitespace'],
		['mac', 'MAC address (aa:bb:cc:dd:ee:ff)'],
		['ip', 'IP address (trim, no leading zeros)'],
		['hostname', 'Short host name (host from host.domain)'],
		['fqdn', 'Fully qualified domain name'],
		['user', 'User name (strip DOMAIN\\ and @domain)'],
		['email', 'Email address (lowercase)'],
		['os', 'Operating system family'],
	];
	const VALIDATION_TYPE_CHOICES = [
		['none', 'None'], ['ip', 'IP address (v4 or v6)'], ['ipv4', 'IPv4 address'], ['ipv6', 'IPv6 address'], ['mac', 'MAC address'], ['email', 'Email address'],
		['hostname', 'Host name'], ['fqdn', 'Fully qualified domain name'], ['cidr', 'IPv4 CIDR'], ['integer', 'Whole number'], ['number', 'Number'],
	];
	const VALUE_TYPE_CHOICES = [['string', 'Text'], ['number', 'Number'], ['bool', 'True/false'], ['time', 'Time'], ['cidr', 'CIDR']];
	const MERGE_CHOICES = [['latest', 'Latest'], ['earliest', 'Earliest'], ['min', 'Min'], ['max', 'Max'], ['avg', 'Average'], ['sum', 'Sum'], ['coalesce', 'Coalesce (by source order)']];
	const AGE_UNITS = [['s', 'seconds'], ['m', 'minutes'], ['h', 'hours'], ['d', 'days'], ['w', 'weeks'], ['mon', 'months'], ['q', 'quarters'], ['y', 'years']];
	const TIPS = {
		name: 'Letters, digits and underscores, starting with a letter or underscore. Reserved names are not allowed. The name cannot be changed after the field is created.',
		desc: 'What this field means, for the people who use the asset data. It has no effect on the merge.',
		fenabled: 'A disabled field is left out of the merge but keeps its settings.',
		key: 'Records that share a value in a key field are merged into one asset, even across sources.',
		keyscope: 'A scoped key only matches rows of the same scope (site or tenant). Use global for values that are unique everywhere, such as MAC addresses and serial numbers. Needs a scope on the sources or a scope column in Settings.',
		ftype: 'Single keeps one value per asset. Multivalue keeps every unique value.',
		merge: 'How one value is chosen when sources disagree. Latest and Earliest go by the _time of the source rows. Min, Max, Average and Sum work on numbers (set Value type to Number). Coalesce takes the first non-empty value in the order you give.',
		order: 'The precedence of the sources for Coalesce: the first source in the list that has a value wins. Without an order a random order is used.',
		cs: 'When off, values are matched case-insensitively (lowercased unless Keep original case is on).',
		keepcase: 'Store the original value and lowercase it only when matching. Values that differ only by case are then kept separately. Not available with normalizers that lowercase the value (host name, FQDN, user name, email, operating system).',
		norm: 'Rewrites every value into a canonical form before matching and merging, so the same asset matches across sources.',
		valtype: 'Values that are not of this type are dropped (checked after normalizing).',
		ignore: 'Values to ignore. Type a value, re:<regular expression> or cidr:<network>, for example unknown, re:^169\\.254\\. or cidr:127.0.0.0/8.',
		inherit: 'Also ignore the values on the global ignore list in Settings.',
		validation: 'A regular expression every value must match. Values that do not match are ignored. Case-insensitive fields are lowercased before validation.',
		evalx: 'An SPL eval expression applied to this field before merging, for example replace(field1, "[^w]", "").',
		fillnull: 'Fill empty values with a fixed value. Not allowed on key fields, it would merge unrelated assets.',
		vtype: 'The type declared for the field in the KV store collection (single value fields).',
		track: 'Record this field in the asset’s conflicts field when its sources disagree, so those assets can be reviewed. Costs memory in proportion to the distinct values.',
		allowed: 'Only take values for this field from these sources. Leave empty for all sources.',
		maxvals: 'The most values kept for a multivalue field.',
		mvorder: 'Which values are kept when there are more than Max values: the most recent (needs a _time column in the source lookups) or the alphabetically first.',
		lookup: 'The lookup file or lookup definition to read. It must be readable by this app.',
		sname: 'The label used in the merge search. Letters, digits and underscores; it cannot be changed later.',
		enabled: 'A disabled source is left out of the merge but keeps its settings.',
		role: 'Authoritative sources create assets and link them. Enrich-only sources (a vulnerability scanner, a firewall log) only add data to an asset they match unambiguously and never create or link assets.',
		scope: 'The site or tenant of every row in this source, for keys marked Scoped. The same value in two scopes stays two assets.',
		age: 'Ignore rows older than this. Rows without a time are kept. Leave empty to keep every row.',
		timefield: 'The column holding the epoch time of each row, when the lookup does not use _time.',
		filter: 'Keep only rows where this where-expression is true, written against the source columns, for example status!="decommissioned".',
		mapping: 'When this source names a column differently, map it to the asset field, for example Computer Name to nt_host. Only this source is affected.',
		max_keys: 'The largest number of unique keys a merged asset may have. Assets in larger clusters are dropped, usually because of a shared key such as a NAT address. The hard limit is ' + Generator.HARD_MAX_KEYS + '.',
		max_key_share: 'A key found in more rows than this is not used to match assets (0 turns it off). Catches shared keys the blocklist does not know about.',
		min_pct: 'A run that produces fewer assets than this share of the last successful run is not written and is recorded as blocked_low_count. 0 turns the check off. A run that produces no assets never overwrites the asset database.',
		empty: 'An empty search result would otherwise wipe the collection, so it is never written. This cannot be turned off.',
		runs_to_keep: 'How many runs the run history keeps. Older runs are removed on every run, so it cannot grow without bound.',
		change_history: 'Record which assets were added, removed or changed (and which fields) on every run. Not recorded for runs blocked by the safety check.',
		history_index: 'Index mode: the index that receives the change events (sourcetype assetdb:change). It must already exist; on Splunk Cloud an admin creates it first.',
		history_rows: 'KV store mode: how many change records are kept (100 to 200000). Older ones are removed on every run.',
		default_cs: 'Used for new fields and for fields that do not set it themselves.',
		default_norm: 'Applied to fields whose normalizer is Default.',
		scope_field: 'A column in the source lookups that holds the site or tenant of each row, for sources without a fixed scope. Leave empty if you do not scope keys.',
		blocklist: 'Values that are never used to match assets, in any key field: placeholders, loopback and similar. A blocked value still appears in the asset, it just cannot link two assets. Type a value, re:<regular expression> or cidr:<network>.',
		gignore: 'Ignored in every field that uses the global list. Type a value, re:<regular expression> or cidr:<network>.',
		scheduled: 'Turn off to run the merge manually only.',
		cron: 'When the merge search runs, as a cron expression, for example 0 0 * * * for daily at midnight.',
	};

	/* ---------- Small helpers ---------- */
	const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	const clone = (o) => JSON.parse(JSON.stringify(o));
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	/** A jQuery/SDK deferred as a native promise; the SDK resolves with (data, ...), so the first argument is the data. */
	const P = (d) => new Promise((resolve, reject) => $.when(d).then((data) => resolve(data), reject));
	const ico = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;

	function makeUrl(path) {
		const root = (typeof window !== 'undefined' && window.$C && window.$C.MRSPARKLE_ROOT_PATH) || '';
		return `${root}/${MvcUtils.getPageInfo().locale}${path}`;
	}

	/**
	 * Best-effort readable message from a failed Splunk REST call.
	 */
	function describeError(err) {
		const body = err?.data || safeParse(err?.responseText, null) || safeParse(err?.response?.data, null);
		const message = body?.messages?.[0]?.text;
		if (message) return message;
		const status = err?.status || err?.response?.status;
		return status ? `request failed with HTTP status ${status}` : (err?.message || 'request failed');
	}

	/* ---------- REST ---------- */
	const getConf = (endpoint) => P(SERVICE.get(ENDPOINT_BASE + endpoint, { count: 0 }).promise());
	const setConf = (endpoint, data) => P(SERVICE.post(ENDPOINT_BASE + endpoint, data).promise());
	const delConf = (endpoint) => P(SERVICE.del(ENDPOINT_BASE + endpoint).promise());
	const validateQuery = (query) => P(SERVICE.post(VALIDATION_ENDPOINT, { q: query, output_mode: 'json' }).promise());
	const oneshot = (search, count = 0) => P(SERVICE.post(JOBS, { search, exec_mode: 'oneshot', output_mode: 'json', count }).promise()).then((data) => safeParse(Array.isArray(data) ? data[0] : data, {}).results || []);

	/**
	 * Update the 'lookups' key within the 'general' stanza. The current list is read from the server first so concurrent
	 * edits are not overwritten with stale page state.
	 */
	function updateLookups(source, operation) {
		return getConf('conf-assetdb').then((data) => {
			const lookupArray = getLookupArray(safeParse(data, {}).entry || []);
			if (operation === 'add') {
				let low = 0;
				let high = lookupArray.length;
				while (low < high) {
					const mid = (low + high) >>> 1;
					if (lookupArray[mid].name < source.name) low = mid + 1;
					else high = mid;
				}
				lookupArray.splice(low, 0, source);
			} else if (operation === 'update') {
				const index = lookupArray.findIndex((item) => item.name === source.name);
				if (index < 0) return Promise.reject({ message: `source ${source.name} no longer exists` });
				lookupArray[index] = Object.assign({}, lookupArray[index], source);
			} else if (operation === 'delete') {
				const index = lookupArray.findIndex((item) => item.name === source.name);
				if (index > -1) lookupArray.splice(index, 1);
			} else {
				return Promise.reject({ message: `unknown operation ${operation}` });
			}
			return setConf('conf-assetdb/general/', { lookups: JSON.stringify(lookupArray) });
		});
	}

	/**
	 * Bring the KV collection definition in line with the fields: an index on every key field (the collection allows 10,
	 * `asset` takes one), a field type for single value fields, and the enrichment macro.
	 */
	function syncCollection() {
		return getConf('conf-assetdb').then((data) => {
			const fields = (safeParse(data, {}).entry || []).filter((e) => e.name !== 'general');
			const desired = {};
			fields.filter((f) => parseInt(f.content.key_field)).slice(0, MAX_KEY_ACCELERATIONS).forEach((f) => {
				desired[`accelerated_fields.${f.name}`] = JSON.stringify({ [f.name]: 1 });
			});
			fields.forEach((f) => {
				if (f.content.field_type === 'single' && f.content.value_type) desired[`field.${f.name}`] = f.content.value_type;
			});
			const outputs = ['_key AS asset_id', 'source AS asset_source', 'source_lookup AS asset_source_lookup', 'last_seen AS asset_last_seen'].concat(fields.map((f) => `${f.name} AS asset_${f.name}`));
			return Promise.all([P(SERVICE.post(ENRICH_MACRO_ENDPOINT, { definition: outputs.join(', ') }).promise()), P(SERVICE.get(COLLECTION_ENDPOINT, { output_mode: 'json' }).promise())]).then(([, current]) => {
				const content = ((safeParse(current, {}).entry || [])[0] || {}).content || {};
				const protectedNames = ['asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts'];
				const changes = {};
				Object.keys(desired).forEach((k) => {
					if (content[k] !== desired[k]) changes[k] = desired[k];
				});
				Object.keys(content).forEach((k) => {
					const m = /^(accelerated_fields|field)\.(.+)$/.exec(k);
					if (m && !protectedNames.includes(m[2]) && content[k] !== '' && !(k in desired)) changes[k] = '';
				});
				return Object.keys(changes).length ? P(SERVICE.post(COLLECTION_ENDPOINT, changes).promise()) : null;
			});
		});
	}

	const FIXED_COLUMNS = ['_key', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts'];
	const fieldsListWrite = (names) => setConf('conf-transforms/assetdb', { fields_list: names.concat(FIXED_COLUMNS).join(',') });

	/** Write a field to assetdb.conf (and the transforms field list when it is new or removed). No KV sync: persist() does that. */
	function writeField(names, name, data, operation) {
		if (operation === 'add') {
			const list = names.slice();
			if (!list.includes(name)) list.push(name);
			return Promise.all([setConf('conf-assetdb/', Object.assign({ name }, data)), fieldsListWrite(list)]);
		}
		if (operation === 'edit') return setConf('conf-assetdb/' + name, data);
		return Promise.all([delConf('conf-assetdb/' + name), fieldsListWrite(names.filter((n) => n !== name))]);
	}

	function updateSearch() {
		return makeMergeSearch().then((query) => setConf(SAVED, { search: query }));
	}

	/** The merge search as typed lines {kind: 'comment' | 'command', text} (pure; the page renders these directly). */
	const searchLines = (fieldArray) => Generator.buildSearchLines(fieldArray);
	const searchText = (fieldArray) => searchLines(fieldArray).map((line) => line.text).join('\n');

	/** Same, reading the current config from the server when no entries are given. */
	function makeMergeSearchLines(fieldArray = []) {
		const promise = fieldArray.length ? Promise.resolve(null) : getConf('conf-assetdb');
		return promise.then((data) => searchLines(fieldArray.length ? fieldArray : safeParse(data, {}).entry || []));
	}
	function makeMergeSearch(fieldArray = []) {
		return makeMergeSearchLines(fieldArray).then((lines) => lines.map((line) => line.text).join('\n'));
	}

	/* ---------- Models: conf <-> editor ---------- */
	const asBool = (v, dflt) => (v === undefined || v === '' || v === null ? dflt : !!parseInt(v));
	function fieldFromEntry(entry, general) {
		const c = entry.content || {};
		return {
			name: entry.name,
			description: c.description || '',
			enabled: !['0', 'false', 'no'].includes(String(c.enabled).toLowerCase()),
			key: !!parseInt(c.key_field || 0),
			keyScope: c.key_scope === 'scoped' ? 'scoped' : 'global',
			fieldType: c.field_type === 'multivalue' ? 'multivalue' : 'single',
			cs: !!parseInt(c.case_sensitive ?? general.default_case_sensitive ?? 0),
			keepCase: !!parseInt(c.keep_case || 0),
			norm: c.normalizer || 'default',
			valType: c.validation_type || 'none',
			validation: c.validation || '',
			ignore: c.ignore_values ? safeParse(c.ignore_values, []) : [],
			inherit: asBool(c.inherit_ignore, true),
			allowed: c.allowed_sources ? String(c.allowed_sources).split(',').filter(Boolean) : [],
			evalExpr: c.eval_expression || '',
			fillnull: c.fillnull || '',
			method: c.merge_method || 'latest',
			order: c.merge_order ? String(c.merge_order).split(',').filter(Boolean) : [],
			valueType: c.value_type || 'string',
			track: !!parseInt(c.track_conflicts || 0),
			maxValues: parseInt(c.max_values || 10) || 10,
			mvOrder: c.mv_order === 'alpha' ? 'alpha' : 'recent',
		};
	}
	function blankField() {
		return { name: '', description: '', enabled: true, key: false, keyScope: 'global', fieldType: 'single', cs: !!parseInt(S.general.default_case_sensitive || 0), keepCase: false, norm: 'default', valType: 'none', validation: '', ignore: [], inherit: true, allowed: [], evalExpr: '', fillnull: '', method: 'latest', order: [], valueType: 'string', track: false, maxValues: 10, mvOrder: 'recent' };
	}
	/** The conf properties of a field, exactly as the previous editor wrote them. */
	function fieldToConf(m) {
		const single = m.fieldType === 'single';
		return {
			enabled: m.enabled ? '1' : '0',
			key_field: m.key ? '1' : '0',
			case_sensitive: m.cs ? '1' : '0',
			ignore_values: JSON.stringify(m.ignore),
			fillnull: m.fillnull,
			validation: m.validation,
			field_type: m.fieldType,
			merge_method: m.method,
			merge_order: m.order.join(','),
			inherit_ignore: m.inherit ? '1' : '0',
			allowed_sources: m.allowed.join(','),
			max_values: String(m.maxValues || 2),
			mv_order: m.mvOrder,
			keep_case: m.key && !m.cs && m.keepCase ? '1' : '0',
			description: m.description,
			track_conflicts: single && m.track ? '1' : '0',
			key_scope: m.key ? m.keyScope : 'global',
			normalizer: m.norm,
			validation_type: m.valType,
			value_type: single ? m.valueType : 'string',
			eval_expression: m.evalExpr,
		};
	}
	function parseAge(v) {
		const m = /^(\d+)(s|m|h|d|w|mon|q|y)$/.exec(v || '');
		return m ? { n: m[1], unit: m[2] } : { n: '', unit: 'd' };
	}
	function sourceFromConf(s) {
		const age = parseAge(s.max_age);
		return { name: s.name, lookup: s.lookup, enabled: Generator.sourceEnabled(s), role: s.role === 'enrich' ? 'enrich' : 'authoritative', scope: s.scope || '', ageN: age.n, ageUnit: age.unit, timeField: s.time_field || '', filter: s.filter || '', map: Object.entries(s.columns || {}).map(([to, from]) => ({ to, from })) };
	}
	function blankSource() {
		return { name: '', lookup: '', enabled: true, role: 'authoritative', scope: '', ageN: '', ageUnit: 'd', timeField: '', filter: '', map: [] };
	}
	function sourceToConf(m) {
		const columns = {};
		m.map.forEach((r) => { if (r.to.trim() && r.from.trim()) columns[r.to.trim()] = r.from.trim(); });
		return { enabled: !!m.enabled, role: m.role, scope: m.scope.trim(), max_age: m.ageN ? `${parseInt(m.ageN)}${m.ageUnit}` : '', time_field: m.timeField.trim(), filter: m.filter.trim(), columns };
	}
	function settingsFromConf(general, fieldArray, sched) {
		const ratio = parseFloat(general.min_ratio === undefined ? Generator.DEFAULT_MIN_RATIO : general.min_ratio);
		return {
			max_keys: String(Generator.parseMaxKeys(fieldArray)),
			max_key_share: String(general.max_key_share === undefined ? Generator.DEFAULT_MAX_KEY_SHARE : general.max_key_share),
			min_pct: String(Math.round((isNaN(ratio) ? Generator.DEFAULT_MIN_RATIO : ratio) * 10000) / 100),
			runs_to_keep: String(general.runs_to_keep === undefined ? Generator.DEFAULT_RUNS_TO_KEEP : general.runs_to_keep),
			change_history: general.change_history || 'off',
			history_index: general.history_index || '',
			history_rows: String(general.history_rows === undefined ? Generator.DEFAULT_HISTORY_ROWS : general.history_rows),
			default_cs: !!parseInt(general.default_case_sensitive) || false,
			default_norm: general.default_normalizer || 'none',
			scope_field: general.scope_field || '',
			blocklist: Generator.getKeyBlocklist(general),
			ignore: general.ignore_values ? safeParse(general.ignore_values, []) : [],
			scheduled: sched.enabled,
			cron: sched.cron,
		};
	}

	/* ---------- State ---------- */
	const S = { loaded: false, general: {}, entries: [], fields: [], sources: [], settings: null, sched: { cron: '', enabled: true, next: '' }, stats: {}, lookups: null, runs: null, overflow: null, changes: null };
	const ui = { tab: 'fields', filter: '', drawer: null, save: 'idle', banner: null, running: false, searchStale: false, expanded: new Set(), retry: null, preview: { state: 'idle', sid: '', summary: null, sources: null, clusters: null, current: null, error: '' }, sdraft: null, advOpen: false };

	async function loadConf() {
		const [data, sched] = await Promise.all([getConf('conf-assetdb'), getConf(SAVED).catch(() => null)]);
		S.entries = safeParse(data, {}).entry || [];
		S.general = (S.entries.find((e) => e.name === 'general') || {}).content || {};
		S.fields = S.entries.filter((e) => e.name !== 'general').map((e) => fieldFromEntry(e, S.general)).sort((a, b) => a.name.localeCompare(b.name));
		S.sources = getLookupArray(S.entries).map(sourceFromConf).concat([]);
		S.sourceConf = getLookupArray(S.entries);
		const ss = ((safeParse(sched, {}).entry || [])[0] || {}).content || {};
		S.sched = { cron: ss.cron_schedule || '0 0 * * *', enabled: !!parseInt(ss.enableSched ?? 1), next: ss.next_scheduled_time || '' };
		S.settings = settingsFromConf(S.general, S.entries, S.sched);
		S.loaded = true;
	}

	/** Row count and columns of a lookup, read once and cached; a failure is kept so the row can flag it. */
	function inspectLookup(lookup, force) {
		if (!force && S.stats[lookup]) return Promise.resolve(S.stats[lookup]);
		S.stats[lookup] = { pending: true };
		const safe = /^[A-Za-z0-9_.-]+$/.test(lookup);
		if (!safe) { S.stats[lookup] = { error: 'The lookup name is not valid.' }; return Promise.resolve(S.stats[lookup]); }
		return Promise.all([oneshot(`| inputlookup ${lookup} | stats count`), oneshot(`| inputlookup ${lookup} | head 200`)]).then(([counted, sample]) => {
			const columns = [];
			sample.forEach((row) => Object.keys(row).forEach((k) => { if (!k.startsWith('_') && !columns.includes(k)) columns.push(k); }));
			S.stats[lookup] = { count: parseInt((counted[0] || {}).count || 0), columns, sample: sample.slice(0, 3) };
			return S.stats[lookup];
		}, (err) => { S.stats[lookup] = { error: describeError(err) }; return S.stats[lookup]; });
	}
	function inspectAll(force) {
		return Promise.all(S.sources.map((s) => inspectLookup(s.lookup, force))).then(() => { if (!ui.drawer || !draftDirty()) renderPane(); renderHeader(); });
	}

	async function loadRuns() {
		const [runs, overflow, changes] = await Promise.all([
			oneshot('| inputlookup assetdb_runs | sort 0 -run_time | head 10', 10).catch(() => null),
			oneshot('| inputlookup assetdb_overflow | head 10', 10).catch(() => null),
			oneshot('| inputlookup assetdb_changes | sort 0 -run_time | head 15', 15).catch(() => null),
		]);
		S.runs = runs; S.overflow = overflow; S.changes = changes;
	}
	const lastRun = () => (S.runs && S.runs[0]) || null;

	async function loadLookups() {
		if (S.lookups) return S.lookups;
		const get = (path) => P(SERVICE.get(path, { count: 0, output_mode: 'json' }).promise()).then((d) => safeParse(Array.isArray(d) ? d[0] : d, {}).entry || []).catch(() => []);
		const [files, defs] = await Promise.all([get('/servicesNS/-/-/data/lookup-table-files'), get('/servicesNS/-/-/data/transforms/lookups')]);
		const seen = new Set();
		S.lookups = files.concat(defs).map((e) => ({ name: e.name, app: (e.acl || {}).app || '' })).filter((e) => !seen.has(e.name) && seen.add(e.name)).sort((a, b) => a.name.localeCompare(b.name));
		return S.lookups;
	}

	/* ---------- Problems shown on rows ---------- */
	const enabledFields = () => S.fields.filter((x) => x.enabled);
	function supplies(name) {
		return S.sources.some((s) => s.enabled && (s.map.some((m) => m.to === name && m.from) || ((S.stats[s.lookup] || {}).columns || []).includes(name)));
	}
	function problems(kind, item) {
		const out = [];
		if (kind === 'source') {
			const st = S.stats[item.lookup] || {};
			if (st.error) out.push({ sev: 'bad', text: `The lookup “${item.lookup}” could not be read, so this source cannot be merged: ${st.error}` });
			else if (item.enabled && st.count === 0) out.push({ sev: 'warn', text: 'This lookup has no rows.' });
		} else if (item.enabled && Object.keys(S.stats).length && !Object.values(S.stats).some((x) => x.pending) && !supplies(item.name)) {
			out.push({ sev: 'warn', text: item.key ? 'No enabled source supplies this key field, so it cannot match any records. Map a column to it in a source, or enable a source that has it.' : 'No enabled source supplies this field, so it will always be empty.' });
		}
		return out;
	}
	const attention = () => S.sources.filter((x) => problems('source', x).length).length + S.fields.filter((x) => problems('field', x).length).length;
	const needs = (n) => `${n} ${n === 1 ? 'needs' : 'need'} attention`;

	/* ---------- Shadow DOM shell ---------- */
	const ROOT = host.attachShadow({ mode: 'open' });
	const $q = (s, r = ROOT) => r.querySelector(s);
	const $$ = (s, r = ROOT) => [...r.querySelectorAll(s)];
	const cssUrl = `${(window.$C && window.$C.MRSPARKLE_ROOT_PATH) || ''}/static/app/assetdb/css/assetdb.css`;
	ROOT.innerHTML = `<link rel="stylesheet" href="${cssUrl}">
	<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
		<symbol id="i-search" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></symbol>
		<symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></symbol>
		<symbol id="i-x" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></symbol>
		<symbol id="i-play" viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z"/></symbol>
		<symbol id="i-chev" viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></symbol>
		<symbol id="i-copy" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></symbol>
		<symbol id="i-ext" viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5"/></symbol>
		<symbol id="i-alert" viewBox="0 0 16 16"><path d="M8 2.5 14 13H2z"/><path d="M8 7v3M8 11.8v.1"/></symbol>
		<symbol id="i-check" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5"/></symbol>
		<symbol id="i-trash" viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></symbol>
		<symbol id="i-dup" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/></symbol>
		<symbol id="i-key" viewBox="0 0 16 16"><circle cx="5.5" cy="10.5" r="2.5"/><path d="M7.3 8.7 13 3M11 5l1.8 1.8M9.2 6.8l1.4 1.4"/></symbol>
		<symbol id="i-edit" viewBox="0 0 16 16"><path d="M3 13l.5-3L11 2.5 13.5 5 6 12.5z"/></symbol>
	</defs></svg>
	<div id="hdr"></div><main id="main" tabindex="-1"></main>
	<div id="live" class="sr-only" role="status" aria-live="polite"></div><div class="toasts" id="toasts" aria-live="polite"></div>`;

	/** Follow Splunk's own light or dark theme: the page background tells which one is active. */
	function detectTheme() {
		const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor || '');
		const dark = rgb ? (0.2126 * rgb[1] + 0.7152 * rgb[2] + 0.0722 * rgb[3]) / 255 < 0.45 : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
		host.setAttribute('data-theme', dark ? 'dark' : 'light');
	}

	const live = (m) => { const l = $q('#live'); l.textContent = ''; setTimeout(() => { l.textContent = m; }, 30); };
	const fid = () => { const a = ROOT.activeElement; return a && a.dataset && a.dataset.fid ? a.dataset.fid : null; };
	const refocus = (id) => { if (!id) return; const el = $q(`[data-fid="${CSS.escape(id)}"]`); if (el) el.focus({ preventScroll: true }); };
	function toast(msg) {
		const t = document.createElement('div'); t.className = 'toast';
		t.innerHTML = `${ico('check')}<span>${esc(msg)}</span>`; $q('#toasts').replaceChildren(t);
		setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 180); }, 4500);
	}

	/* ---------- Form building blocks (one look for every input) ---------- */
	let tipN = 0;
	const tip = (text, label) => { const id = 'tip' + (++tipN); return `<span class="tip"><button type="button" class="tip-b" aria-label="About ${esc(label)}" aria-describedby="${id}">i</button><span role="tooltip" id="${id}" class="tip-t">${esc(text)}</span></span>`; };
	const labelRow = (forId, text, tipKey, optional) => `<div class="lrow"><label for="${forId}">${text}${optional ? ' <span class="optl">(optional)</span>' : ''}</label>${tipKey ? tip(TIPS[tipKey], text) : ''}</div>`;
	const opts = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
	const selectField = (id, key, text, tipKey, list, val) => `<div>${labelRow(id, text, tipKey)}<select class="inp" id="${id}" data-d="${key}" data-fid="${id}">${opts(list, val)}</select></div>`;
	const textField = (id, key, text, tipKey, val, o = {}) => `<div>${labelRow(id, text, tipKey, o.optional)}<input class="inp ${o.mono ? 'mono' : ''}" id="${id}" data-d="${key}" data-fid="${id}" value="${esc(val)}" placeholder="${esc(o.ph || '')}" autocomplete="off" spellcheck="false" ${o.err ? `aria-describedby="${id}-e"` : ''}>${o.err ? `<div class="err" id="${id}-e" hidden></div>` : ''}</div>`;
	const switchRow = (key, text, tipKey, val, act = 'dswitch') => { const id = 'sw-' + key; return `<div class="srow"><div class="lrow"><span class="l" id="${id}-l">${text}</span>${tip(TIPS[tipKey], text)}</div><button class="switch" id="${id}" type="button" role="switch" aria-checked="${val}" aria-labelledby="${id}-l" data-act="${act}" data-k="${key}" data-fid="${id}"></button></div>`; };
	const segField = (key, text, tipKey, list, val) => `<div><div class="lrow"><span class="l" id="seg-${key}-l">${text}</span>${tip(TIPS[tipKey], text)}</div><div class="seg" role="radiogroup" aria-labelledby="seg-${key}-l">${list.map(([v, l]) => `<label><input type="radio" name="${key}" value="${v}" ${v === val ? 'checked' : ''} data-d="${key}" data-fid="seg-${key}-${v}">${l}</label>`).join('')}</div></div>`;
	const numberField = (id, key, text, tipKey, val, o = {}) => `<div>${labelRow(id, text, tipKey)}<div class="w-num"><input class="inp" type="number" id="${id}" min="${o.min ?? 0}" ${o.max ? `max="${o.max}"` : ''} value="${esc(val)}" data-d="${key}" data-fid="${id}"></div></div>`;
	const chipsField = (id, text, tipKey, vals) => `<div>${labelRow('chip-' + id, text, tipKey)}${chipsHtml(id, vals, 'chip-' + id)}</div>`;

	/* ---------- Dirty tracking: nothing is written until Save ---------- */
	const draftDirty = () => !!(ui.drawer && ui.drawer.draft && JSON.stringify(ui.drawer.draft) !== ui.drawer.orig);
	const settingsDirty = () => !!(ui.sdraft && S.settings && JSON.stringify(ui.sdraft) !== JSON.stringify(S.settings));
	const anyDirty = () => draftDirty() || settingsDirty();
	function guard(proceed) {
		if (!anyDirty()) { proceed(); return; }
		const what = draftDirty() ? (ui.drawer.kind === 'field' ? 'field' : 'source') : 'settings';
		openModal({ title: 'Discard unsaved changes?', body: `Your edits to this ${what} have not been saved and will be lost.`, confirm: 'Discard changes', cancel: 'Keep editing', destructive: true,
			onConfirm: () => { if (ui.drawer && ui.drawer.draft) ui.drawer.orig = JSON.stringify(ui.drawer.draft); if (ui.sdraft) ui.sdraft = clone(S.settings); proceed(); } });
	}

	/* ---------- Write chain with visible state: config, KV collection, merge search ---------- */
	function updateSaveState() {
		const el = $q('.savestate'); if (!el) return;
		const dirty = anyDirty() && ui.save !== 'saving' && ui.save !== 'failed';
		const strip = $q('.d-status'); if (strip) strip.dataset.state = ui.save === 'failed' ? 'failed' : ui.save === 'saving' ? 'saving' : dirty ? 'dirty' : 'saved';
		el.innerHTML = !S.loaded ? '' : ui.save === 'saving' ? '<span class="spin" aria-hidden="true"></span>Saving…' : ui.save === 'failed' ? `${ico('alert')}Not fully saved` : dirty ? `${ico('edit')}Unsaved changes` : '<svg class="ico tick" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>All changes saved';
	}
	function setSave(s) { ui.save = s; renderHeader(); syncSaveBtn(); }

	/**
	 * Save one change: the config writes, then the KV collection, then the regenerated merge search. Each step reports
	 * on its own so the user knows what state the system is in. Resolves true when the config was written.
	 *
	 * @param {String}		label		Short description, used in messages
	 * @param {Function}	writes		Returns a promise for the config writes
	 * @param {Function}	retry		Called by the "Try again" button of a failed write
	 */
	async function persist(label, writes, retry) {
		setSave('saving');
		try {
			await writes();
		} catch (err) {
			ui.banner = { kind: 'bad', title: `Could not save “${label}”.`, text: `${describeError(err)}. Some of the change may have been written; your edits are still open. Try again.`, action: 'Try again', act: 'retry' };
			ui.retry = retry; await loadConf().catch(() => {}); setSave('failed'); live(`Could not save ${label}.`); return false;
		}
		ui.banner = null; let syncError = null;
		try { await syncCollection(); } catch (err) { syncError = err; }
		try {
			await updateSearch(); ui.searchStale = false;
		} catch (err) {
			ui.searchStale = true;
			ui.banner = { kind: 'bad', title: `Saved “${label}”, but the merge search was not updated.`, text: `${describeError(err)}. The scheduled run keeps using the previous search until you regenerate it.`, action: 'Regenerate search', act: 'regen' };
		}
		if (syncError && !ui.banner) ui.banner = { kind: 'warn', title: `Saved “${label}”. Field types are out of sync.`, text: `${describeError(syncError)}. Searches still work. Sync the KV store field types to finish.`, action: 'Retry sync', act: 'sync' };
		await loadConf().catch(() => {});
		setSave(ui.searchStale ? 'failed' : 'saved'); live(`${label} saved`);
		inspectAll(); return true;
	}

	/* ---------- Header: section nav, run action, status strip (Splunk provides the app navigation) ---------- */
	const TABS = [['sources', 'Sources'], ['fields', 'Fields'], ['pipeline', 'Pipeline'], ['settings', 'Settings']];
	function nextRunText() {
		if (!S.sched.enabled) return 'not scheduled';
		// next_scheduled_time looks like "2026-11-01 00:00:00 EDT": read the date and time, the zone is the server's
		const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(S.sched.next || '');
		const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
		return d ? d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `cron ${S.sched.cron}`;
	}
	function runInfo() {
		const r = lastRun();
		if (!r) return null;
		const out = parseInt(r.assets_out || 0); const prev = parseInt(r.assets_prev || 0);
		const status = r.status === 'ok' ? 'ok' : /^blocked/.test(r.status || '') ? 'warn' : 'bad';
		return { time: r.run_time ? new Date(parseFloat(r.run_time) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '', status, out, delta: prev || out ? (out - prev >= 0 ? '+' : '') + (out - prev).toLocaleString() : '', raw: r.status };
	}
	function renderHeader() {
		const h = $q('#hdr'); const before = fid();
		const loading = !S.loaded; const info = runInfo(); const n = loading ? 0 : attention();
		const meta = loading ? '' : !info ? (S.runs === null ? '' : 'Never run') : `Last run ${esc(info.time)}${info.status === 'ok' ? '' : ` (${esc(info.raw)})`} · ${info.out.toLocaleString()} assets${info.delta ? ` <span class="delta ${info.delta.startsWith('-') ? 'neg' : ''}">${esc(info.delta)}</span>` : ''} · merge search ${ui.searchStale ? '<span class="pill bad">out of date</span>' : 'up to date'}`;
		const need = loading ? '' : n ? ` · <span class="attn">${n} item${n > 1 ? 's' : ''} ${n > 1 ? 'need' : 'needs'} attention</span>` : '';
		const runDisabled = loading || ui.running || !(S.sources.some((s) => s.enabled) && enabledFields().length);
		h.innerHTML = `<div class="d-in" style="padding-top:8px"><div class="d-subnav"><div class="tabs" role="tablist" aria-label="Configure sections">${TABS.map(([id, label]) => `<button class="tab" role="tab" id="tab-${id}" data-tab="${id}" data-fid="tab-${id}" aria-selected="${ui.tab === id}" aria-controls="panel" tabindex="${ui.tab === id ? 0 : -1}">${label}${!loading && id === 'sources' ? `<span class="n">${S.sources.length}</span>` : ''}${!loading && id === 'fields' ? `<span class="n">${S.fields.length}</span>` : ''}</button>`).join('')}</div>
			<div class="d-run"><span>Next run <b>${loading ? '' : esc(nextRunText())}</b></span><button class="btn" type="button" data-act="run" data-fid="run" ${runDisabled ? 'disabled' : ''}>${ui.running ? '<span class="spin" aria-hidden="true"></span>Merging…' : `${ico('play')}Run now`}</button></div></div>
			<div class="d-status" data-state="saved"><span class="savestate" role="status" aria-live="polite"></span><span class="d-meta">${meta}${need}</span><button class="linkbtn" type="button" data-act="runs" data-fid="status" ${loading ? 'disabled' : ''}>Run history</button></div>
			<div class="runbar ${ui.running ? 'on' : ''}" aria-hidden="true"></div><div id="banner"></div></div>`;
		updateSaveState(); renderBanner(); refocus(before);
	}
	function renderBanner() {
		const b = $q('#banner'); if (!b) return; const x = ui.banner;
		b.innerHTML = x ? `<div class="banner ${x.kind}" role="alert">${ico('alert')}<div class="grow"><b>${esc(x.title)}</b><div class="muted">${esc(x.text)}</div></div><button class="btn sm" type="button" data-act="${x.act}" data-fid="banner-act">${esc(x.action)}</button><button class="btn icon" type="button" data-act="dismissBanner" aria-label="Dismiss">${ico('x')}</button></div>` : '';
	}

	/* ---------- Panes ---------- */
	function renderMain() {
		$q('#main').innerHTML = `<div id="head"></div><div class="layout" id="layout"><section id="panel" role="tabpanel" aria-labelledby="tab-${ui.tab}" tabindex="-1" style="min-width:0"></section><aside id="drawer" aria-label="Editor" hidden></aside></div>`;
		renderPane(); if (ui.drawer) mountDrawer(true);
	}
	function pageHead() {
		const H = { sources: ['Sources', 'Source lookups that feed the asset list. Enrich-only sources never create assets.', `<button class="btn primary" type="button" data-act="addSource" data-fid="add-source">${ico('plus')}Add source</button>`],
			fields: ['Fields', 'Key fields decide which records are the same asset. Every field is merged onto that asset.', `<button class="btn" type="button" data-act="preset" data-fid="presets">Add CIM preset</button><button class="btn primary" type="button" data-act="addField" data-fid="add-field">${ico('plus')}Add field</button>`],
			pipeline: ['Pipeline', 'The merge search, stage by stage. It is regenerated whenever you save a change.', ''], settings: ['Settings', 'Options that apply to the whole merge.', ''] }[ui.tab];
		return `<div class="d-head"><div><h1>${H[0]}</h1><p>${H[1]}</p></div><div class="d-actions">${H[2]}</div></div>`;
	}
	function renderPane() {
		const p = $q('#panel'); if (!p) return; const before = fid();
		p.setAttribute('aria-labelledby', `tab-${ui.tab}`);
		$q('#head').innerHTML = S.loaded ? pageHead() : '';
		p.innerHTML = !S.loaded ? skeleton() : ({ sources: paneSources, fields: paneFields, pipeline: panePipeline, settings: paneSettings })[ui.tab]();
		$q('#layout').classList.toggle('with-drawer', !!ui.drawer);
		refocus(before);
	}
	const skeleton = () => `<div class="panel" aria-busy="true">${Array.from({ length: 6 }, () => `<div style="display:flex;gap:24px;padding:16px 20px;border-top:1px solid var(--line)"><div style="flex:2"><div class="skel" style="width:140px"></div></div><div class="skel" style="flex:3"></div><div class="skel" style="flex:1"></div></div>`).join('')}</div>`;

	const flag = (list) => { if (!list.length) return ''; const id = 'tip' + (++tipN); const sev = list.some((q) => q.sev === 'bad') ? 'bad' : 'warn'; return `<span class="tip"><button type="button" class="tip-b flag ${sev}" aria-label="Needs attention" aria-describedby="${id}">${ico('alert')}</button><span role="tooltip" id="${id}" class="tip-t">${esc(list.map((q) => q.text).join(' '))}</span></span>`; };
	const enabledSwitch = (kind, id, name, on, editing) => `<td class="sw"><button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Enabled, ${kind} ${esc(name)}" data-act="toggleRow" data-kind="${kind}" data-id="${esc(id)}" data-fid="en-${kind}-${esc(id)}" ${editing ? 'disabled title="Being edited: change it in the editor"' : ''}></button></td>`;
	const rowActions = (kind, id, name) => `<td class="act"><button class="btn icon" type="button" data-act="${kind === 'field' ? 'editField' : 'editSource'}" data-id="${esc(id)}" data-fid="${kind === 'field' ? 'fld' : 'src'}-${esc(id)}" aria-label="Edit ${kind} ${esc(name)}" title="Edit">${ico('edit')}</button><button class="btn icon" type="button" data-act="dupRow" data-kind="${kind}" data-id="${esc(id)}" aria-label="Duplicate ${kind} ${esc(name)}" title="Duplicate">${ico('dup')}</button><button class="btn icon danger" type="button" data-act="rmRow" data-kind="${kind}" data-id="${esc(id)}" aria-label="Remove ${kind} ${esc(name)}" title="Remove">${ico('trash')}</button></td>`;

	function paneSources() {
		if (!S.sources.length) return emptyFirstRun();
		const bad = S.sources.filter((x) => problems('source', x).length).length;
		return `<div class="panel"><table class="tbl"><caption class="sr-only">Source lookups</caption>
			<thead><tr><th scope="col">Source</th><th scope="col">Role</th><th scope="col" class="hide-s hide-d">Scope</th><th scope="col" class="hide-s hide-d">Max age</th><th scope="col" class="num">Rows</th><th scope="col">Enabled</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
			<tbody>${S.sources.map((s) => { const ed = !!ui.drawer && ui.drawer.kind === 'source' && ui.drawer.id === s.name; const st = S.stats[s.lookup] || {}; const c = S.sourceConf.find((q) => q.name === s.name) || {}; return `<tr data-open data-id="${esc(s.name)}" data-active="${ed}" class="${s.enabled ? '' : 'off'}">
				<td><span class="fname">${esc(s.name)}</span>${flag(problems('source', s))}<small>${esc(s.lookup)}</small></td>
				<td>${s.role === 'enrich' ? 'Enrich only' : 'Authoritative'}</td>
				<td class="hide-s hide-d">${s.scope ? esc(s.scope) : '—'}</td><td class="hide-s hide-d">${c.max_age ? esc(c.max_age) : '—'}</td>
				<td class="num">${st.pending || st.count === undefined ? (st.error ? '—' : '…') : st.count.toLocaleString()}</td>${enabledSwitch('source', s.name, s.name, s.enabled, ed)}${rowActions('source', s.name, s.name)}</tr>`; }).join('')}</tbody></table>
			<div class="tbl-foot">${S.sources.filter((s) => s.enabled).length} of ${S.sources.length} enabled${bad ? ` · <span class="attn">${needs(bad)}</span>` : ''}.</div></div>`;
	}
	function emptyFirstRun() {
		const st = [S.sources.length > 0, S.fields.length > 0, !!lastRun()];
		return `<div class="panel"><div class="empty"><h2>Bring your asset lists together</h2>
			<p>AssetDB merges records from several lookups into one asset per device, matched on the fields you choose (host name, IP, MAC).</p>
			<div class="check"><strong>Get started</strong><ul>${[['Add a source lookup', 'addSource', 'Add source'], ['Choose the fields to match and merge', 'preset', 'Add CIM preset'], ['Run the first merge', 'run', 'Run now']].map(([t, a, b], i) => `<li data-done="${st[i]}"><span class="n">${st[i] ? ico('check') : i + 1}</span><span class="t" style="flex:1">${t}</span>${st[i] ? '' : `<button class="btn sm ${i === st.findIndex((x) => !x) ? 'primary' : ''}" type="button" data-act="${a}" ${i === 2 && (!st[0] || !st[1]) ? 'disabled' : ''}>${b}</button>`}</li>`).join('')}</ul></div>
			<p class="hint">This card disappears once all three steps are done.</p></div></div>`;
	}
	function visibleFields() {
		const q = ui.filter.trim().toLowerCase();
		return S.fields.filter((x) => !q || x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q)).sort((a, b) => (b.key - a.key) || a.name.localeCompare(b.name));
	}
	function paneFields() {
		if (!S.fields.length) return `<div class="panel"><div class="empty"><h2>No fields yet</h2><p>Fields decide what is matched and what is kept. Start from the common security fields, or define your own.</p><div style="display:flex;gap:8px"><button class="btn primary" type="button" data-act="preset">Add CIM preset</button><button class="btn" type="button" data-act="addField">Add field</button></div></div></div>`;
		const list = visibleFields(); const bad = S.fields.filter((x) => problems('field', x).length).length;
		return `<div class="panel"><div class="searchbar"><div class="search"><svg class="ico" aria-hidden="true"><use href="#i-search"/></svg><input id="f-filter" class="inp" type="search" placeholder="Filter fields   ( / )" aria-label="Filter fields" value="${esc(ui.filter)}" data-fid="filter"></div></div>
			<table class="tbl"><caption class="sr-only">Fields. Match keys are listed first.</caption>
			<thead><tr><th scope="col">Field</th><th scope="col">Description</th><th scope="col">Enabled</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
			<tbody>${list.map((x) => { const ed = !!ui.drawer && ui.drawer.kind === 'field' && ui.drawer.id === x.name; return `<tr data-open data-id="${esc(x.name)}" data-active="${ed}" class="${x.enabled ? '' : 'off'}">
				<td><span class="kslot">${x.key ? `<span class="keymark" title="Key field">${ico('key')}<span class="sr-only">Key field</span></span>` : ''}</span><span class="fname">${esc(x.name)}</span>${flag(problems('field', x))}</td>
				<td class="muted">${esc(x.description) || '—'}</td>${enabledSwitch('field', x.name, x.name, x.enabled, ed)}${rowActions('field', x.name, x.name)}</tr>`; }).join('')}</tbody></table>
			${list.length ? '' : `<div class="empty"><h2>No fields match</h2><p>Nothing matches “${esc(ui.filter)}”.</p><button class="btn" type="button" data-act="clearFilter">Clear filter</button></div>`}
			<div class="tbl-foot">${S.fields.length} field${S.fields.length === 1 ? '' : 's'}, ${S.fields.filter((x) => x.key).length} ${S.fields.filter((x) => x.key).length === 1 ? 'is a match key' : 'are match keys'}${bad ? ` · <span class="attn">${needs(bad)}</span>` : ''}.</div></div>`;
	}

	/* ---------- Pipeline: the generated search, grouped by the generator's own section comments ---------- */
	let LINES = []; let LINES_ERR = '';
	function refreshLines() {
		return makeMergeSearchLines(S.entries).then((lines) => { LINES = lines; LINES_ERR = ''; }, (err) => { LINES = []; LINES_ERR = describeError(err); });
	}
	function stages() {
		const out = []; let cur = null;
		LINES.forEach((l, i) => {
			if (l.kind === 'comment') { cur = { title: l.text.replace(/^\s*```?|```?\s*$/g, '').replace(/^\/\*|\*\/$/g, '').trim() || 'Search', lines: [] }; out.push(cur); } else { if (!cur) { cur = { title: 'Search', lines: [] }; out.push(cur); } cur.lines.push({ text: l.text, n: i + 1 }); }
		});
		return out;
	}
	function hl(line) {
		return format.tokenize({ kind: 'command', text: line }).map((t) => {
			const c = { keyword: 'tk-cmd', string: 'tk-str', comment: 'tk-com', argument: 'tk-macro', 'operator-word': 'tk-cmd' }[t.type];
			return c ? `<span class="${c}">${esc(t.text)}</span>` : esc(t.text);
		}).join('');
	}
	const codeBlock = (lines) => `<div class="code" role="region" tabindex="0" aria-label="Generated search">${lines.map((l) => `<div class="ln"><i>${l.n}</i><span>${hl(l.text)}</span></div>`).join('')}</div>`;
	function panePipeline() {
		const pv = ui.preview;
		const kp = pv.state === 'loading' ? Array.from({ length: 4 }, () => `<div class="kpi"><div class="skel" style="height:28px;width:70%"></div><div class="skel" style="height:10px;width:50%;margin-top:8px"></div></div>`).join('') : pv.summary ? [['assets', 'assets after merge'], ['overflow_clusters', 'oversized clusters'], ['rows_without_keys', 'rows without a key'], ['shared_keys_skipped', 'shared keys skipped'], ['merge_inputs', 'rows merged'], ['enrich_unmatched', 'enrich rows unmatched']].map(([k, label]) => `<div class="kpi"><div class="v">${esc(pv.summary[k] || 0)}</div><div class="k">${label}</div></div>`).join('') : '';
		const st = stages();
		return `<div class="panel" style="margin-bottom:24px"><div class="toolbar"><h2>Preview</h2><span class="muted">Runs the merge without saving it${pv.current !== null && pv.state === 'done' ? `; the asset database holds ${esc(pv.current)} now` : ''}.</span><span class="grow"></span><button class="btn" type="button" data-act="preview" data-fid="preview" ${pv.state === 'loading' ? 'disabled' : ''}>${pv.state === 'loading' ? '<span class="spin"></span>Running…' : `${ico('play')}Run preview`}</button>${pv.sid ? `<a class="btn" href="${esc(makeUrl('/app/search/search') + '?sid=' + encodeURIComponent(pv.sid))}" target="_blank" rel="noopener" data-fid="open-preview" title="Open this preview search job in the Search app, in a new window">${ico('ext')}Open in Search</a>` : ''}</div>
			${pv.error ? `<p class="err" style="padding:0 20px 16px;margin:0">${ico('alert')}<span>The preview could not run: ${esc(pv.error)}</span></p>` : kp ? `<div class="cards3" aria-live="polite">${kp}</div>` : '<p class="hint" style="padding:0 20px 16px;margin:0">It does the work of a real run without the writes, so it can take a while on big inventories.</p>'}
			${pv.state === 'done' && pv.sources && pv.sources.length ? `<div style="padding:0 20px 20px"><table class="runs"><thead><tr><th>Source</th><th>Assets</th></tr></thead><tbody>${pv.sources.map((r) => `<tr><td>${esc(r.source)}</td><td>${esc(r.assets)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
		<div class="panel"><div class="toolbar"><h2>Stages</h2><span class="muted">${LINES.length} lines</span><span class="grow"></span><button class="btn" type="button" data-act="expandAll">Expand all</button></div>
		${LINES_ERR ? `<p class="err" style="padding:0 20px 16px;margin:0">${ico('alert')}<span>The merge search cannot be built: ${esc(LINES_ERR)}</span></p>` : ''}
		<div class="stages">${st.map((s, i) => { const open = ui.expanded.has(i); return `<div class="stage"><button class="stage-h" type="button" data-act="stage" data-id="${i}" data-fid="stage-${i}" aria-expanded="${open}" aria-controls="sb-${i}"><span class="num">${i + 1}</span><span class="grow"><span class="t">${esc(s.title)}</span></span><span class="muted" style="font-size:13px">${s.lines.length} line${s.lines.length === 1 ? '' : 's'}</span>${ico('chev').replace('class="ico"', 'class="ico chev"')}</button><div class="stage-body" id="sb-${i}" ${open ? '' : 'hidden'}>${s.lines.length ? codeBlock(s.lines) : '<p class="hint">No lines.</p>'}</div></div>`; }).join('')}</div></div>
		<details class="panel" style="margin-top:24px" ${ui.expanded.has('raw') ? 'open' : ''} data-act-toggle="raw"><summary style="padding:14px 20px;cursor:pointer;font-weight:600">Raw search <span class="muted" style="font-weight:400">(${LINES.length} lines${ui.searchStale ? ' · out of date' : ''})</span></summary>
			<div style="padding:0 20px 20px"><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn sm" type="button" data-act="copy" data-fid="copy">${ico('copy')}Copy</button><a class="btn sm" href="${esc(makeUrl('/app/assetdb/search') + '?s=%2FservicesNS%2Fnobody%2Fassetdb%2Fsaved%2Fsearches%2Fassetdb-lookupgen')}" target="_blank" rel="noopener">${ico('ext')}Open in Search</a></div>${codeBlock(LINES.map((l, i) => ({ text: l.text, n: i + 1 })))}</div></details>`;
	}

	/**
	 * Run the merge up to adbmerge without writing anything. The summary runs as a normal search job so its SID can be
	 * opened in the Search app; the per source table and the current size are small one-shot searches.
	 */
	async function runPreview() {
		const pv = ui.preview; Object.assign(pv, { state: 'loading', sid: '', summary: null, sources: null, clusters: null, current: null, error: '' }); renderPane();
		try {
			const lines = await makeMergeSearchLines(S.entries); const searches = Generator.buildPreviewSearches(lines);
			const created = safeParse(await P(SERVICE.post(JOBS, { search: searches.summary, output_mode: 'json', exec_mode: 'normal' }).promise()), {});
			pv.sid = created.sid || ''; renderPane();
			if (!pv.sid) throw new Error('the search job could not be created');
			let dispatchState = '';
			for (let i = 0; i < 1200; i++) {
				const job = ((safeParse(await P(SERVICE.get(`${JOBS}/${pv.sid}`, { output_mode: 'json' }).promise()), {}).entry || [])[0] || {}).content || {};
				dispatchState = job.dispatchState;
				if (job.isFailed || dispatchState === 'FAILED') throw new Error((job.messages && job.messages[0] && job.messages[0].text) || 'the preview search failed');
				if (job.isDone || dispatchState === 'DONE') break;
				await wait(1000);
			}
			const res = safeParse(await P(SERVICE.get(`${JOBS}/${pv.sid}/results`, { output_mode: 'json', count: 0 }).promise()), {}).results || [];
			pv.summary = res[0] || {};
			const [sources, current] = await Promise.all([oneshot(searches.sources).catch(() => []), oneshot(searches.current).catch(() => [])]);
			pv.sources = sources; pv.current = current[0] ? current[0].assets : null; pv.state = 'done';
		} catch (err) { pv.state = 'error'; pv.error = describeError(err); }
		renderPane(); refocus('preview'); live(pv.error ? 'The preview failed' : 'Preview finished');
	}

	/* ---------- Settings (a draft with its own Save bar) ---------- */
	function paneSettings() {
		if (!ui.sdraft) ui.sdraft = clone(S.settings);
		const v = ui.sdraft; const dirty = settingsDirty();
		const num = (k, label, min, max, suffix) => `<div class="srow2"><div class="lrow"><label for="st-${k}">${label}</label>${tip(TIPS[k], label)}</div><div><div class="w-num">${suffix ? `<div class="compound"><input class="inp" type="number" id="st-${k}" min="${min}" max="${max}" value="${esc(v[k])}" data-s="${k}" data-min="${min}" data-max="${max}" data-fid="st-${k}" aria-describedby="st-${k}-e"><span class="suffix">${suffix}</span></div>` : `<input class="inp" type="number" id="st-${k}" min="${min}" max="${max}" value="${esc(v[k])}" data-s="${k}" data-min="${min}" data-max="${max}" data-fid="st-${k}" aria-describedby="st-${k}-e">`}</div><div class="err" id="st-${k}-e" hidden></div></div></div>`;
		const txt = (k, label, o = {}) => `<div class="srow2"><div class="lrow"><label for="st-${k}">${label}</label>${tip(TIPS[k], label)}</div><div><input class="inp ${o.mono ? 'mono' : ''}" style="max-width:${o.w || 320}px" id="st-${k}" value="${esc(v[k])}" data-s="${k}" data-text data-fid="st-${k}" aria-describedby="st-${k}-e" autocomplete="off" spellcheck="false"><div class="err" id="st-${k}-e" hidden></div></div></div>`;
		const sel = (k, label, list) => `<div class="srow2"><div class="lrow"><label for="st-${k}">${label}</label>${tip(TIPS[k], label)}</div><div><select class="inp" style="max-width:320px" id="st-${k}" data-s="${k}" data-text data-fid="st-${k}">${opts(list, v[k])}</select></div></div>`;
		const sw = (k, label) => `<div class="srow2"><div class="lrow"><span class="l" id="sw-${k}-l">${label}</span>${tip(TIPS[k] || TIPS.scheduled, label)}</div><div><button class="switch" type="button" role="switch" aria-checked="${v[k]}" aria-labelledby="sw-${k}-l" data-act="sbool" data-k="${k}" data-fid="st-${k}"></button></div></div>`;
		const chips = (id, k, label, tipKey) => `<div class="srow2"><div class="lrow"><label id="${id}-l">${label}</label>${tip(TIPS[tipKey], label)}</div>${chipsHtml(id, v[k], id + '-l')}</div>`;
		const group = (title, desc, rows) => `<section class="sgroup" aria-labelledby="g-${title.replace(/\W/g, '')}"><header><h2 id="g-${title.replace(/\W/g, '')}">${title}</h2><p>${desc}</p></header>${rows}</section>`;
		return `${group('Limits', 'Guards that stop bad data from merging unrelated assets.', num('max_keys', 'Max keys per asset', 1, Generator.HARD_MAX_KEYS) + num('max_key_share', 'Max rows sharing a key', 0, 1000000))}
			${group('Run safety', 'Protects the asset list from a bad run.', num('min_pct', 'Minimum size versus last run', 0, 100, '%') + `<div class="srow2"><div class="lrow"><span class="l">Overwrite with an empty result</span>${tip(TIPS.empty, 'Overwrite with an empty result')}</div><div class="static">Never</div></div>`)}
			${group('Schedule', 'When the merge search runs on its own.', sw('scheduled', 'Scheduled') + txt('cron', 'Schedule (cron)', { mono: true, w: 240 }))}
			${group('History', 'How much run and change history is kept.', num('runs_to_keep', 'Runs to keep', 1, 5000) + sel('change_history', 'Change history', [['off', 'Off'], ['kv', 'KV store collection (assetdb_changes)'], ['index', 'Index']]) + (v.change_history === 'index' ? txt('history_index', 'History index', { mono: true, w: 240 }) : '') + (v.change_history === 'kv' ? num('history_rows', 'Change log rows', 100, 200000) : ''))}
			${group('Matching defaults', 'Used by fields that do not set their own.', sw('default_cs', 'Case sensitive') + sel('default_norm', 'Normalizer', NORMALIZER_CHOICES) + txt('scope_field', 'Scope column', { mono: true, w: 240 }))}
			${group('Values to ignore', 'Placeholder values that should never link or fill assets.', chips('blocklist', 'blocklist', 'Key blocklist', 'blocklist') + chips('globalIgnore', 'ignore', 'Global ignore list', 'gignore'))}
			<div class="savebar"><span class="unsaved" ${dirty ? '' : 'hidden'}>Unsaved changes</span><button class="btn" type="button" data-act="sdiscard" ${dirty ? '' : 'disabled'}>Discard changes</button><button class="btn primary" type="button" data-act="ssave" data-fid="ssave" ${dirty && ui.save !== 'saving' ? '' : 'disabled'}>Save settings</button></div>`;
	}
	function refreshSettingsBar() {
		const bar = $q('.savebar'); if (!bar) return; const d = settingsDirty();
		$q('.unsaved', bar).hidden = !d; $q('[data-act=sdiscard]', bar).disabled = !d; $q('[data-act=ssave]', bar).disabled = !d || ui.save === 'saving';
	}
	function showErr(inputSel, errSel, err) { const i = $q(inputSel); const e = $q(errSel); if (!i || !e) return; i.setAttribute('aria-invalid', !!err); e.hidden = !err; e.innerHTML = err ? ico('alert') + `<span>${esc(err)}</span>` : ''; }
	async function saveSettings() {
		const v = ui.sdraft; let bad = null; const fail = (id, msg) => { showErr(`#${id}`, `#${id}-e`, msg); if (!bad) bad = $q(`#${id}`); };
		const whole = (x) => /^\d+$/.test(String(x).trim());
		['max_keys', 'max_key_share', 'runs_to_keep', 'history_rows', 'min_pct', 'history_index', 'scope_field', 'cron'].forEach((k) => showErr(`#st-${k}`, `#st-${k}-e`, ''));
		if (!whole(v.max_keys) || parseInt(v.max_keys) < 1 || parseInt(v.max_keys) > Generator.HARD_MAX_KEYS) fail('st-max_keys', `Enter a whole number from 1 to ${Generator.HARD_MAX_KEYS}`);
		if (!whole(v.max_key_share) || parseInt(v.max_key_share) > 1000000) fail('st-max_key_share', 'Enter a whole number from 0 to 1000000');
		const pct = parseFloat(v.min_pct); if (isNaN(pct) || pct < 0 || pct > 100) fail('st-min_pct', 'Enter a number from 0 to 100');
		if (!whole(v.runs_to_keep) || parseInt(v.runs_to_keep) < 1 || parseInt(v.runs_to_keep) > 5000) fail('st-runs_to_keep', 'Enter a whole number from 1 to 5000');
		if (v.change_history === 'index' && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v.history_index.trim())) fail('st-history_index', 'Enter the name of an existing index');
		if (v.change_history === 'kv' && (!whole(v.history_rows) || parseInt(v.history_rows) < 100 || parseInt(v.history_rows) > 200000)) fail('st-history_rows', 'Enter a whole number from 100 to 200000');
		if (v.scope_field.trim() && /['"\\|`[\]]/.test(v.scope_field)) fail('st-scope_field', 'That column name has a character that is not allowed');
		if (!CRON_RE.test(v.cron)) fail('st-cron', 'Enter a cron expression with 5 fields, e.g. 0 0 * * *');
		if (bad) { bad.focus(); return; }
		const draft = clone(v); const run = () => saveSettings();
		const writes = () => Promise.all([
			setConf('conf-assetdb/general/', {
				max_keys: String(parseInt(draft.max_keys)), default_case_sensitive: draft.default_cs ? '1' : '0', default_normalizer: draft.default_norm, ignore_values: JSON.stringify(draft.ignore),
				key_blocklist: JSON.stringify(draft.blocklist), max_key_share: String(parseInt(draft.max_key_share)), scope_field: draft.scope_field.trim(), change_history: draft.change_history,
				history_index: draft.history_index.trim(), history_rows: String(parseInt(draft.history_rows)), min_ratio: String(Math.round(parseFloat(draft.min_pct) * 100) / 10000), runs_to_keep: String(parseInt(draft.runs_to_keep)),
			}),
			setConf(SAVED, { cron_schedule: draft.cron.trim(), enableSched: draft.scheduled ? '1' : '0' }),
		]);
		if (!await persist('settings', writes, run)) return;
		ui.sdraft = clone(S.settings); await refreshLines(); renderPane(); renderHeader(); toast('Saved settings.');
	}

	/* ---------- Chips (draft arrays) ---------- */
	function chipsHtml(id, vals, labelledby) {
		const listId = id === 'allowed' || id === 'order' ? 'src-list' : '';
		return `<div data-chipwrap="${id}"><div class="chips" data-chips="${id}" role="group" aria-labelledby="${labelledby}">${vals.map((v, i) => chipHtml(id, v, i)).join('')}<input type="text" data-chip-input="${id}" data-fid="ci-${id}" aria-label="Add value" ${listId ? `list="${listId}"` : ''} placeholder="${vals.length ? '' : (listId ? 'All sources' : 'Type a value, press Enter')}"></div>${listId ? `<datalist id="src-list">${S.sources.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>` : ''}<div class="err" data-chip-err="${id}" hidden role="alert"></div></div>`;
	}
	function chipHtml(id, v, i) {
		const kind = v.startsWith('re:') ? 'regex' : v.startsWith('cidr:') ? 'cidr' : '';
		return `<span class="chip">${kind ? `<span class="k">${kind}</span>` : ''}<span>${esc(kind ? v.slice(v.indexOf(':') + 1) : v)}</span><button type="button" data-chip-del="${id}" data-i="${i}" aria-label="Remove ${esc(v)}">${ico('x')}</button></span>`;
	}
	function chipError(id, v) {
		if (id === 'allowed' || id === 'order') return S.sources.some((s) => s.name === v) ? '' : `“${v}” is not one of your sources.`;
		if (v.startsWith('re:')) { if (v.length === 3) return 'Enter a pattern after re:'; try { new RegExp(v.slice(3)); } catch (e) { return `“${v.slice(3)}” is not a valid regular expression.`; } }
		if (v.startsWith('cidr:') && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(v.slice(5))) return 'Use a network like 10.0.0.0/8.';
		return '';
	}
	const chipArr = (id) => id === 'blocklist' ? ui.sdraft.blocklist : id === 'globalIgnore' ? ui.sdraft.ignore : id === 'allowed' ? ui.drawer.draft.allowed : id === 'order' ? ui.drawer.draft.order : ui.drawer.draft.ignore;
	function refreshChips(id) {
		const w = $q(`[data-chipwrap="${CSS.escape(id)}"]`); if (!w) return; const lab = $q('[data-chips]', w).getAttribute('aria-labelledby');
		w.outerHTML = chipsHtml(id, chipArr(id), lab); refocus(`ci-${id}`); onDraftChange();
	}

	/* ---------- Editor card: field, source, run history ---------- */
	function openDrawer(kind, id, returnFid, extra = {}) {
		const run = async () => {
			let draft = null;
			if (kind === 'field') draft = extra.create ? extra.draft : clone(S.fields.find((x) => x.name === id));
			if (kind === 'source') draft = extra.create ? extra.draft : clone(S.sources.find((x) => x.name === id));
			ui.drawer = { kind, id, returnFid, create: !!extra.create, draft, orig: draft ? JSON.stringify(extra.create && !extra.dup ? draft : extra.dup ? (kind === 'field' ? blankField() : blankSource()) : draft) : '', origName: draft ? draft.name : '' };
			if (kind === 'runs') loadRuns().then(() => { if (ui.drawer && ui.drawer.kind === 'runs') mountDrawer(true); renderHeader(); });
			if (kind === 'source') { loadLookups().then(() => { if (ui.drawer && ui.drawer.kind === 'source' && ui.drawer.create) rerender(); }); if (draft.lookup) inspectLookup(draft.lookup).then(() => { if (ui.drawer && ui.drawer.kind === 'source') rerender(); }); }
			mountDrawer(false); renderPane(); updateSaveState();
			live(`${kind === 'runs' ? 'Run history' : extra.create ? 'Add ' + kind : 'Edit ' + kind + ' ' + ui.drawer.origName} panel opened`);
		};
		if (ui.drawer) guard(() => { closeDrawerNow(true); run(); }); else run();
	}
	function focusTitle() { const t = $q('#dr-title'); if (t) t.focus({ preventScroll: true }); }
	function mountDrawer(silent) {
		const o = editorModel(); const d = $q('#drawer'); d.hidden = false; const keep = $q('.drawer-body') ? $q('.drawer-body').scrollTop : 0;
		d.innerHTML = `<div class="drawer" role="dialog" aria-modal="false" aria-labelledby="dr-title"><div class="drawer-h"><h2 id="dr-title" tabindex="-1">${o.title}</h2><span data-unsaved-pill>${draftDirty() ? '<span class="unsaved">Unsaved</span>' : ''}</span><button class="btn icon" type="button" data-act="closeDrawer" aria-label="Close editor (Esc)">${ico('x')}</button></div><div class="drawer-body">${o.body}</div>${o.footer}</div>`;
		$q('#layout').classList.add('with-drawer'); if (keep) $q('.drawer-body').scrollTop = keep;
		if (!silent) setTimeout(focusTitle, 0);
	}
	function closeDrawerNow(skipFocus) {
		const dr = ui.drawer; if (!dr) return; const rf = dr.returnFid;
		const done = () => {
			ui.drawer = null; const d = $q('#drawer'); if (d) { d.hidden = true; d.innerHTML = ''; }
			renderPane(); updateSaveState();
			if (!skipFocus) { const t = rf && $q(`[data-fid="${CSS.escape(rf)}"]`); (t || $q('#panel')).focus(); }
		};
		const el = $q('.drawer'); if (el && !reduced() && !skipFocus) { el.classList.add('out'); setTimeout(done, 170); } else done();
	}
	const requestClose = () => guard(() => closeDrawerNow());
	const editorModel = () => ({ field: fieldModel, source: sourceModel, runs: runsModel })[ui.drawer.kind]();
	function rerender() { const f0 = fid(); mountDrawer(true); refocus(f0); onDraftChange(); }

	function fieldModel() {
		const dr = ui.drawer; const x = dr.draft; const create = dr.create; const single = x.fieldType === 'single';
		const normChoices = [['default', `Default (${S.general.default_normalizer || 'none'})`]].concat(NORMALIZER_CHOICES);
		const body = `
			<fieldset class="sec"><legend>Identity</legend>
				${create ? textField('fd-name', 'name', 'Name', 'name', x.name, { mono: true, err: true }) : ''}
				${textField('fd-desc', 'description', 'Description', 'desc', x.description, { optional: true })}
				${switchRow('enabled', 'Enabled', 'fenabled', x.enabled)}
				${switchRow('key', 'Key field', 'key', x.key)}
				${x.key ? segField('keyScope', 'Key scope', 'keyscope', [['global', 'Global'], ['scoped', 'Scoped']], x.keyScope) : ''}
				${segField('fieldType', 'Field type', 'ftype', [['single', 'Single'], ['multivalue', 'Multivalue']], x.fieldType)}
			</fieldset>
			${single ? `<fieldset class="sec"><legend>Merge</legend>
				${selectField('fd-merge', 'method', 'Method', 'merge', MERGE_CHOICES, x.method)}
				${x.method === 'coalesce' ? chipsField('order', 'Source order', 'order', x.order) : ''}
			</fieldset>` : ''}
			<fieldset class="sec"><legend>Clean-up</legend>
				${switchRow('cs', 'Case sensitive', 'cs', x.cs)}
				${x.key && !x.cs ? switchRow('keepCase', 'Keep original case', 'keepcase', x.keepCase) : ''}
				${selectField('fd-norm', 'norm', 'Normalize', 'norm', normChoices, x.norm)}
				${selectField('fd-valtype', 'valType', 'Validate as', 'valtype', VALIDATION_TYPE_CHOICES, x.valType)}
				${chipsField('ignore', 'Ignore values', 'ignore', x.ignore)}
				${switchRow('inherit', 'Use the global ignore list', 'inherit', x.inherit)}
			</fieldset>
			<details class="adv" id="sec-adv" ${ui.advOpen ? 'open' : ''}><summary>Advanced</summary><div class="adv-in">
				${textField('fd-validation', 'validation', 'Validation pattern', 'validation', x.validation, { optional: true, mono: true, err: true })}
				${textField('fd-eval', 'evalExpr', 'Eval expression', 'evalx', x.evalExpr, { optional: true, mono: true, err: true })}
				${textField('fd-fill', 'fillnull', 'Fill null', 'fillnull', x.fillnull, { optional: true, err: true })}
				${single ? selectField('fd-vt', 'valueType', 'Value type', 'vtype', VALUE_TYPE_CHOICES, x.valueType) : ''}
				${single ? switchRow('track', 'Flag conflicts', 'track', x.track) : ''}
				${!single ? numberField('fd-mv', 'maxValues', 'Max values', 'maxvals', x.maxValues, { min: 2 }) : ''}
				${!single ? segField('mvOrder', 'Value order', 'mvorder', [['recent', 'Most recent first'], ['alpha', 'Alphabetical']], x.mvOrder) : ''}
				${chipsField('allowed', 'Only accept values from', 'allowed', x.allowed)}
			</div></details>`;
		return { title: create ? 'Add field' : `Edit field <span class="mono">${esc(dr.origName)}</span>`, body, footer: footerHtml('field') };
	}

	function sourceModel() {
		const dr = ui.drawer; const s = dr.draft; const create = dr.create;
		const st = s.lookup ? (S.stats[s.lookup] || {}) : {}; const cols = st.columns || [];
		const lookups = (S.lookups || []).filter((l) => !S.sources.some((q) => q.lookup === l.name));
		const readFail = s.lookup && st.error;
		const body = `
			${create ? `<fieldset class="sec"><legend>Lookup</legend><div>${labelRow('pick', 'Lookup', 'lookup')}<div class="combo"><input class="inp" id="pick" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pick-list" aria-describedby="pick-e" placeholder="${S.lookups ? 'Search by name or app' : 'Loading lookups…'}" value="${esc(s.lookup)}" data-fid="pick" autocomplete="off"><div class="listbox" id="pick-list" role="listbox" hidden></div></div><div class="err" id="pick-e" role="alert" ${readFail ? '' : 'hidden'}>${readFail ? `${ico('alert')}<span>${esc(st.error)}</span>` : ''}</div></div>
				${s.lookup && st.count !== undefined ? `<details class="adv" open><summary>${st.count.toLocaleString()} rows, ${cols.length} columns found</summary><div class="adv-in"><div class="schema-wrap"><table class="schema"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${(st.sample || []).map((r) => `<tr>${cols.map((c) => `<td>${esc(Array.isArray(r[c]) ? r[c].join(', ') : r[c] === undefined ? '' : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="hint" style="margin:0">A source does not have to fill every column.</p></div></details>` : s.lookup && st.pending ? '<p class="hint">Reading the lookup…</p>' : ''}</fieldset>` : ''}
			${s.lookup && !readFail || !create ? `
			<fieldset class="sec"><legend>Source</legend>
				${create ? textField('sd-name', 'name', 'Name', 'sname', s.name, { mono: true, err: true }) : ''}
				${!create && readFail ? `<div class="err" role="alert">${ico('alert')}<span>The lookup “${esc(s.lookup)}” could not be read: ${esc(st.error)}</span></div>` : ''}
				${switchRow('enabled', 'Enabled', 'enabled', s.enabled)}
				${segField('role', 'Role', 'role', [['authoritative', 'Authoritative'], ['enrich', 'Enrich only']], s.role)}
			</fieldset>
			<fieldset class="sec"><legend>Rows</legend>
				<div>${labelRow('sd-age', 'Max row age', 'age', true)}<div class="w-num"><div class="compound"><input class="inp" type="number" id="sd-age" min="1" value="${esc(s.ageN)}" placeholder="No limit" data-d="ageN" data-fid="sd-age"><select class="inp" aria-label="Unit" data-d="ageUnit">${opts(AGE_UNITS, s.ageUnit)}</select></div></div></div>
				${textField('sd-filter', 'filter', 'Row filter', 'filter', s.filter, { mono: true, optional: true, ph: 'status!="decommissioned"', err: true })}
				${textField('sd-scope', 'scope', 'Scope', 'scope', s.scope, { optional: true, err: true })}
				${textField('sd-time', 'timeField', 'Time column', 'timefield', s.timeField, { optional: true, mono: true })}
			</fieldset>
			<fieldset class="sec"><legend>Field mapping</legend>
				<div>${labelRow('map-0', 'Lookup column → asset field', 'mapping')}
				<div style="display:grid;gap:8px">${s.map.map((m, i) => `<div class="mapline">${cols.length ? `<select class="inp" aria-label="Lookup column ${i + 1}" data-dm="from" data-i="${i}">${opts((cols.includes(m.from) || !m.from ? cols : [m.from].concat(cols)).map((c) => [c, c]), m.from)}</select>` : `<input class="inp mono" aria-label="Lookup column ${i + 1}" value="${esc(m.from)}" data-dm="from" data-i="${i}">`}<span aria-hidden="true" class="muted">→</span><input class="inp mono" aria-label="Asset field ${i + 1}" value="${esc(m.to)}" list="fld-list" data-dm="to" data-i="${i}" id="map-${i}"><button class="btn icon danger" type="button" data-act="mapDel" data-i="${i}" aria-label="Remove mapping ${i + 1}">${ico('x')}</button></div>`).join('')}<datalist id="fld-list">${S.fields.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></div><div class="err" id="map-e" hidden></div></div>
				<div><button class="btn sm" type="button" data-act="mapAdd">${ico('plus')}Add mapping</button></div>
			</fieldset>` : ''}`;
		void lookups;
		return { title: create ? 'Add source' : `Edit source <span class="mono">${esc(dr.origName)}</span>`, body, footer: footerHtml('source') };
	}

	function runsModel() {
		const table = (rows, cols, empty) => rows === null ? '<p class="hint">Could not be read.</p>' : !rows.length ? `<p class="hint">${empty}</p>` : `<table class="runs"><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => { const v = r[c]; return `<td>${esc(c === 'run_time' && v ? new Date(parseFloat(v) * 1000).toLocaleString() : Array.isArray(v) ? v.join(', ') : v === undefined ? '' : v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
		const dyn = (rows) => rows && rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith('_')).slice(0, 7) : [];
		const body = `<fieldset class="sec"><legend>Runs</legend>${S.runs === null && !ui.runsLoaded ? '<p class="hint">Loading…</p>' : table(S.runs, ['run_time', 'status', 'assets_out', 'assets_prev', 'rows_in', 'null_keys', 'overflow_assets', 'junk_keys'], 'No runs recorded yet. The first scheduled or manual run creates the first record.')}</fieldset>
			<fieldset class="sec"><legend>Needs review</legend>${table(S.overflow, dyn(S.overflow), 'No oversized clusters in the last run.')}</fieldset>
			<fieldset class="sec"><legend>Recent changes</legend>${table(S.changes, dyn(S.changes), 'No changes recorded. Turn on Change history in Settings to record them.')}</fieldset>`;
		return { title: 'Run history', body, footer: '<div class="drawer-f"><button class="btn" type="button" data-act="closeDrawer">Close</button></div>' };
	}
	function footerHtml(kind) {
		const dr = ui.drawer;
		return `<div class="drawer-f"><button class="btn primary" type="button" data-act="saveDrawer" data-fid="save" ${dr.create || draftDirty() ? '' : 'disabled'}>${dr.create ? 'Add ' + kind : 'Save'}</button><button class="btn" type="button" data-act="closeDrawer">Cancel</button></div>`;
	}
	function syncSaveBtn() {
		const b = $q('[data-act=saveDrawer]'); if (b && ui.drawer) { const dr = ui.drawer; b.disabled = ui.save === 'saving' || (!dr.create && !draftDirty()); b.textContent = ui.save === 'saving' ? 'Saving…' : dr.create ? 'Add ' + dr.kind : 'Save'; }
		refreshSettingsBar();
	}
	function onDraftChange() {
		$$('[data-unsaved-pill]').forEach((p) => { p.innerHTML = draftDirty() ? '<span class="unsaved">Unsaved</span>' : ''; });
		updateSaveState(); syncSaveBtn();
	}

	/* ---------- Save, toggle, remove, duplicate ---------- */
	const SOURCE_NAME_RE = /^[a-zA-Z0-9_]+$/;
	function fieldNameError(n) {
		if (!n) return 'Enter a name.';
		if (!FIELD_NAME_RE.test(n)) return 'Field name must start with a letter or underscore and can only use alphanumeric characters and underscores';
		if (isReservedFieldName(n)) return `“${n}” is a reserved field name, choose another field name`;
		if (S.fields.some((x) => x.name === n)) return `A field named “${n}” already exists.`;
		return '';
	}
	async function validateField(x, create) {
		let bad = null; const fail = (id, msg) => { showErr(`#${id}`, `#${id}-e`, msg); if (!bad) bad = $q(`#${id}`); };
		['fd-name', 'fd-validation', 'fd-eval', 'fd-fill'].forEach((id) => showErr(`#${id}`, `#${id}-e`, ''));
		if (create) { const e = fieldNameError(x.name.trim()); if (e) fail('fd-name', e); }
		if (x.fillnull && x.key) fail('fd-fill', 'Fill null cannot be used on a key field, it would merge unrelated assets');
		else if (x.fillnull && !/^[a-zA-Z0-9-_]+$/.test(x.fillnull)) fail('fd-fill', 'Fill null can only use alphanumeric characters and underscores');
		if (x.validation) { try { new RegExp(x.validation); } catch (e) { fail('fd-validation', 'Invalid regular expression'); } }
		if (x.key && !x.cs && x.keepCase && ['hostname', 'fqdn', 'user', 'email', 'os'].includes(x.norm === 'default' ? (S.general.default_normalizer || 'none') : x.norm)) fail('sw-keepCase', 'Keep original case cannot be combined with a normalizer that lowercases the value.');
		if (x.evalExpr) {
			try { checkEvalExpression(x.evalExpr); } catch (e) { fail('fd-eval', e.message); }
			if (!bad) { try { await validateQuery(`| makeresults | eval a=${x.evalExpr}`); } catch (err) { const m = (safeParse(err?.responseText, {}).messages || err?.data?.messages || [])[0]; fail('fd-eval', m ? m.text : 'Invalid eval expression'); } }
		}
		if (bad) { $q('#sec-adv') && ['fd-validation', 'fd-eval', 'fd-fill'].includes(bad.id) && ($q('#sec-adv').open = true); bad.focus(); return false; }
		return true;
	}
	async function validateSource(x, create) {
		let bad = null; const fail = (id, msg) => { showErr(`#${id}`, `#${id}-e`, msg); if (!bad) bad = $q(`#${id}`); };
		['sd-name', 'sd-filter', 'sd-scope', 'map'].forEach((id) => showErr(`#${id}`, `#${id}-e`, ''));
		if (create) {
			if (!x.name.trim()) fail('sd-name', 'A name is required');
			else if (!SOURCE_NAME_RE.test(x.name.trim())) fail('sd-name', 'The name can only contain alphanumeric characters or underscores');
			else if (S.sources.some((s) => s.name === x.name.trim())) fail('sd-name', `A source named ${x.name.trim()} already exists`);
			else if (S.sources.some((s) => s.lookup === x.lookup)) fail('sd-name', `A source with lookup ${x.lookup} already exists`);
			if (!x.lookup) { showErr('#pick', '#pick-e', 'Pick a lookup'); if (!bad) bad = $q('#pick'); }
		}
		if (x.scope.trim() && !/^[A-Za-z0-9_.-]+$/.test(x.scope.trim())) fail('sd-scope', 'Use letters, digits, underscore, dot and dash');
		const problems2 = [];
		x.map.forEach((r) => { if (!r.to.trim() && !r.from.trim()) return; if (!r.to.trim() || !r.from.trim()) problems2.push('every mapping needs a column and a field'); else { if (!FIELD_NAME_RE.test(r.to.trim()) || (isReservedFieldName(r.to.trim()) && r.to.trim() !== 'general')) problems2.push(`“${r.to}” is not a valid field name`); if (/['"\\|`[\]]/.test(r.from)) problems2.push(`column “${r.from}” has a character that is not allowed`); } });
		if (problems2.length) { const e = $q('#map-e'); if (e) { e.hidden = false; e.innerHTML = ico('alert') + `<span>${esc([...new Set(problems2)].join('; '))}</span>`; } if (!bad) bad = $q('#map-0'); }
		const filter = x.filter.trim();
		if (filter) {
			try { checkEvalExpression(filter); Generator.checkBalancedParens(filter); } catch (e) { fail('sd-filter', e.message); }
			if (!bad || bad.id !== 'sd-filter') { try { await validateQuery(`| makeresults | where ${filter}`); } catch (err) { const m = (safeParse(err?.responseText, {}).messages || err?.data?.messages || [])[0]; fail('sd-filter', m ? m.text : 'Invalid where expression'); } }
		}
		if (bad) { bad.focus(); return false; }
		return true;
	}
	async function saveDrawer() {
		const dr = ui.drawer; if (!dr || !dr.draft || ui.save === 'saving') return;
		const x = clone(dr.draft); ui.banner = null; renderBanner();
		if (dr.kind === 'field') {
			if (!await validateField(x, dr.create)) return;
			x.name = x.name.trim(); const names = S.fields.map((f) => f.name);
			if (!await persist(x.name, () => writeField(names, x.name, fieldToConf(x), dr.create ? 'add' : 'edit'), saveDrawer)) return;
			await refreshLines(); toast(`Saved field “${x.name}”.`); finishSave(`fld-${x.name}`, x.name);
		} else {
			if (!await validateSource(x, dr.create)) return;
			x.name = x.name.trim();
			const conf = dr.create ? Object.assign({ name: x.name, lookup: x.lookup }, sourceToConf(x)) : Object.assign({ name: dr.origName }, sourceToConf(x));
			if (!await persist(x.name, () => updateLookups(conf, dr.create ? 'add' : 'update'), saveDrawer)) return;
			await refreshLines(); toast(`Saved source “${x.name}”.`); finishSave(`src-${x.name}`, x.name);
		}
	}
	function finishSave(fidv, key) {
		ui.drawer.orig = JSON.stringify(ui.drawer.draft); ui.drawer.returnFid = fidv; closeDrawerNow(true); renderHeader();
		setTimeout(() => { refocus(fidv); const r = $q(`tr[data-id="${CSS.escape(key)}"]`); if (r) r.classList.add('flash'); }, 0);
	}
	/** A switch in a row is one atomic change, so it saves on its own. */
	async function toggleRow(kind, id) {
		const item = kind === 'field' ? S.fields.find((q) => q.name === id) : S.sources.find((q) => q.name === id); if (!item) return;
		const on = !item.enabled; const again = () => toggleRow(kind, id);
		const writes = () => kind === 'field' ? setConf('conf-assetdb/' + id, { enabled: on ? '1' : '0' }) : updateLookups({ name: id, enabled: on }, 'update');
		if (!await persist(`${on ? 'enable' : 'disable'} ${item.name}`, writes, again)) return;
		await refreshLines(); renderPane(); renderHeader(); toast(`${on ? 'Enabled' : 'Disabled'} ${kind} “${item.name}”.`); setTimeout(() => refocus(`en-${kind}-${id}`), 0);
	}
	function askRemove(kind, id) {
		const isF = kind === 'field'; const item = isF ? S.fields.find((q) => q.name === id) : S.sources.find((q) => q.name === id); const name = item.name;
		const dep = isF ? [] : S.fields.filter((x) => x.allowed.includes(name) || x.order.includes(name));
		openModal({ title: `Remove ${kind} “${name}”?`, confirm: `Remove ${kind}`, cancel: 'Cancel', destructive: true,
			body: isF ? 'It will no longer be matched or merged. This is saved immediately and cannot be undone, but you can add the field again.' : `It will no longer be merged; the lookup itself still exists in Splunk.${dep.length ? ` ${dep.length} field${dep.length > 1 ? 's name' : ' names'} it in their allowed sources or source order (<strong>${dep.map((d) => esc(d.name)).join(', ')}</strong>).` : ''} This is saved immediately and cannot be undone, but you can add the source again.`,
			onConfirm: async () => {
				const names = S.fields.map((f) => f.name);
				const writes = () => isF ? writeField(names, name, {}, 'delete') : updateLookups({ name }, 'delete');
				if (!await persist(`remove ${name}`, writes, null)) return;
				if (ui.drawer && ui.drawer.id === id) { ui.drawer.orig = JSON.stringify(ui.drawer.draft); closeDrawerNow(true); }
				await refreshLines(); renderPane(); renderHeader(); toast(`Removed ${kind} “${name}”.`); setTimeout(() => ($q('.tbl .btn.icon') || $q('#panel')).focus(), 0);
			} });
	}
	function dupRow(kind, id) {
		const src = kind === 'field' ? S.fields.find((q) => q.name === id) : S.sources.find((q) => q.name === id);
		const c = clone(src); c.name = src.name + '_copy'; if (kind === 'field') c.key = false; else c.lookup = '';
		openDrawer(kind, null, `${kind === 'field' ? 'fld' : 'src'}-${id}`, { create: true, draft: c, dup: true });
	}
	function addCimPreset() {
		const existing = S.fields.map((e) => e.name); const add = Generator.cimPresetFields().filter((f) => !existing.includes(f.name));
		if (!add.length) { openModal({ title: 'Add CIM fields', body: 'All the CIM asset fields are already configured.', confirm: 'Close', cancel: 'Cancel', onConfirm() {} }); return; }
		openModal({ title: 'Add CIM asset fields?', body: `These ${add.length} fields will be added with sensible defaults (keys, normalizers and validation for the identifiers). You can edit or remove any of them afterwards:<ul>${add.map((x) => `<li><strong>${esc(x.name)}</strong>, ${esc(x.content.description)}${x.content.key_field === '1' ? ' (key)' : ''}</li>`).join('')}</ul>`, confirm: `Add ${add.length} fields`, cancel: 'Cancel',
			onConfirm: async () => {
				const names = existing.concat(add.map((x) => x.name));
				const writes = () => Promise.all(add.map((x) => setConf('conf-assetdb/', Object.assign({ name: x.name }, x.content))).concat([fieldsListWrite(names)]));
				if (await persist('CIM preset', writes, null)) { await refreshLines(); renderPane(); renderHeader(); toast(`Added ${add.length} CIM fields.`); }
			} });
	}
	/** Dispatch the saved search now and follow the job until it finishes. */
	async function runNow() {
		if (ui.running) return; ui.running = true; renderHeader(); live('Merging started');
		try {
			const sid = (safeParse(await P(SERVICE.post('/servicesNS/nobody/assetdb/saved/searches/assetdb-lookupgen/dispatch', { output_mode: 'json' }).promise()), {}) || {}).sid;
			if (!sid) throw new Error('the search job could not be started');
			for (let i = 0; i < 3600; i++) {
				const job = ((safeParse(await P(SERVICE.get(`${JOBS}/${sid}`, { output_mode: 'json' }).promise()), {}).entry || [])[0] || {}).content || {};
				if (job.isFailed) throw new Error((job.messages && job.messages[0] && job.messages[0].text) || 'the merge search failed');
				if (job.isDone) break;
				await wait(2000);
			}
			await Promise.all([loadRuns(), loadConf()]);
			const info = runInfo(); toast(info ? `Run finished: ${info.out.toLocaleString()} assets${info.delta ? ` (${info.delta})` : ''}.` : 'Run finished.'); live('Run finished');
		} catch (err) { ui.banner = { kind: 'bad', title: 'The merge run failed.', text: describeError(err), action: 'Dismiss', act: 'dismissBanner' }; }
		ui.running = false; renderHeader(); renderPane(); inspectAll(true);
	}

	/* ---------- Modal ---------- */
	let modalState = null;
	function openModal({ title, body, confirm, cancel = 'Cancel', destructive, onConfirm }) {
		const sc = document.createElement('div'); sc.className = 'scrim';
		sc.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-b"><h2 id="m-t">${esc(title)}</h2><div id="m-b" class="muted">${body}</div><div class="actions"><button class="btn" type="button" data-m="cancel">${esc(cancel)}</button><button class="btn ${destructive ? 'destructive' : 'primary'}" type="button" data-m="ok">${esc(confirm)}</button></div></div>`;
		ROOT.append(sc); const prevActive = ROOT.activeElement; modalState = { sc, prevActive };
		$q('#hdr').inert = true; $q('#main').inert = true; $q('[data-m=cancel]', sc).focus();
		sc.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
			if (e.key === 'Tab') { const bs = $$('button', sc); const i = bs.indexOf(ROOT.activeElement); if (e.shiftKey && i === 0) { e.preventDefault(); bs[bs.length - 1].focus(); } else if (!e.shiftKey && i === bs.length - 1) { e.preventDefault(); bs[0].focus(); } }
		});
		sc.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (e.target === sc || (m && m.dataset.m === 'cancel')) closeModal(); else if (m) { closeModal(true); onConfirm(); } });
	}
	function closeModal(skipFocus) {
		if (!modalState) return; const { sc, prevActive } = modalState; sc.remove(); modalState = null; $q('#hdr').inert = false; $q('#main').inert = false;
		if (!skipFocus && prevActive && prevActive.isConnected) prevActive.focus();
	}

	/* ---------- Tooltips: fixed position so the scrolling editor never clips them ---------- */
	function showTip(b) {
		const tp = b.closest('.tip'); const t = $q('.tip-t', tp); $$('.tip.on').forEach((x) => x !== tp && x.classList.remove('on'));
		tp.classList.add('on'); const r = b.getBoundingClientRect(); const h = t.offsetHeight;
		t.style.left = Math.max(8, Math.min(r.left - 12, window.innerWidth - 268)) + 'px'; t.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
	}
	const hideTips = () => $$('.tip.on').forEach((x) => x.classList.remove('on'));
	ROOT.addEventListener('mouseover', (e) => { const b = e.target.closest('.tip-b'); if (b) showTip(b); });
	ROOT.addEventListener('mouseout', (e) => { if (e.target.closest('.tip-b')) hideTips(); });
	ROOT.addEventListener('focusin', (e) => { const b = e.target.closest('.tip-b'); if (b) showTip(b); });
	ROOT.addEventListener('focusout', (e) => { if (e.target.closest('.tip-b')) hideTips(); });
	window.addEventListener('scroll', hideTips, true);

	/* ---------- Events ---------- */
	function switchTab(id) { guard(() => { if (ui.drawer) closeDrawerNow(true); ui.tab = id; ui.sdraft = null; renderHeader(); renderMain(); if (id === 'pipeline') refreshLines().then(renderPane); }); }
	ROOT.addEventListener('click', (e) => {
		const tab = e.target.closest('[data-tab]'); if (tab) { if (tab.dataset.tab !== ui.tab) switchTab(tab.dataset.tab); return; }
		const del = e.target.closest('[data-chip-del]');
		if (del) { const id = del.dataset.chipDel; const arr = chipArr(id); const v = arr[+del.dataset.i]; del.closest('.chip').classList.add('out'); setTimeout(() => { arr.splice(+del.dataset.i, 1); if (id === 'order' || id === 'ignore' || id === 'allowed') rerender(); else refreshChips(id); live(`Removed ${v}`); }, reduced() ? 0 : 100); return; }
		const a = e.target.closest('[data-act]');
		if (!a) { const tr = e.target.closest('tr[data-open]'); if (tr && !e.target.closest('input,select,button,a')) { const b = $q('[data-act=editField],[data-act=editSource]', tr); if (b) b.click(); } return; }
		const act = a.dataset.act; const id = a.dataset.id;
		if (a.tagName === 'A') e.preventDefault();
		const fns = {
			runs: () => { if (!(ui.drawer && ui.drawer.kind === 'runs')) openDrawer('runs', null, 'status'); },
			run: runNow,
			addSource: () => openDrawer('source', null, 'add-source', { create: true, draft: blankSource() }),
			editSource: () => openDrawer('source', id, `src-${id}`),
			addField: () => openDrawer('field', null, 'add-field', { create: true, draft: blankField() }),
			editField: () => openDrawer('field', id, `fld-${id}`),
			toggleRow: () => toggleRow(a.dataset.kind, id),
			dupRow: () => dupRow(a.dataset.kind, id),
			rmRow: () => askRemove(a.dataset.kind, id),
			clearFilter: () => { ui.filter = ''; renderPane(); },
			preset: addCimPreset, closeDrawer: requestClose, saveDrawer,
			dswitch: () => { const k = a.dataset.k; ui.drawer.draft[k] = !ui.drawer.draft[k]; if (['key', 'cs'].includes(k)) rerender(); else { a.setAttribute('aria-checked', ui.drawer.draft[k]); onDraftChange(); } },
			sbool: () => { ui.sdraft[a.dataset.k] = !ui.sdraft[a.dataset.k]; renderPane(); refocus(a.dataset.fid); updateSaveState(); },
			ssave: saveSettings,
			sdiscard: () => { ui.sdraft = clone(S.settings); renderPane(); updateSaveState(); toast('Discarded unsaved settings.'); },
			stage: () => { const i = +id; ui.expanded.has(i) ? ui.expanded.delete(i) : ui.expanded.add(i); renderPane(); refocus(`stage-${i}`); },
			expandAll: () => { stages().forEach((_, i) => ui.expanded.add(i)); renderPane(); },
			preview: runPreview,
			copy: () => { try { navigator.clipboard.writeText(LINES.map((l) => l.text).join('\n')); toast('Search copied.'); } catch (er) { toast('Copying is not available in this browser.'); } },
			mapAdd: () => { const st = S.stats[ui.drawer.draft.lookup] || {}; ui.drawer.draft.map.push({ to: '', from: (st.columns || [])[0] || '' }); rerender(); },
			mapDel: () => { ui.drawer.draft.map.splice(+a.dataset.i, 1); rerender(); },
			retry: () => { ui.banner = null; renderBanner(); if (ui.retry) ui.retry(); },
			regen: async () => { ui.banner = null; setSave('saving'); try { await updateSearch(); ui.searchStale = false; setSave('saved'); toast('Merge search regenerated.'); } catch (err) { ui.banner = { kind: 'bad', title: 'The merge search could not be regenerated.', text: describeError(err), action: 'Try again', act: 'regen' }; setSave('failed'); } },
			sync: async () => { ui.banner = null; setSave('saving'); try { await syncCollection(); setSave('saved'); toast('Field types synced.'); } catch (err) { ui.banner = { kind: 'warn', title: 'Field types could not be synced.', text: describeError(err), action: 'Try again', act: 'sync' }; setSave('failed'); } },
			dismissBanner: () => { ui.banner = null; renderBanner(); },
		};
		if (fns[act]) fns[act]();
	});

	ROOT.addEventListener('input', (e) => {
		const t = e.target;
		if (t.id === 'f-filter') { ui.filter = t.value; const pos = t.selectionStart; renderPane(); const n = $q('#f-filter'); n.focus(); n.setSelectionRange(pos, pos); return; }
		if (t.id === 'pick') { pickerInput(t); return; }
		if (t.dataset.d !== undefined && ui.drawer && ui.drawer.draft) {
			const k = t.dataset.d; ui.drawer.draft[k] = t.type === 'number' && k === 'maxValues' ? (parseInt(t.value) || 0) : t.value;
			if (['method', 'fieldType', 'role'].includes(k) && (k !== 'role')) { rerender(); return; }
			if (k === 'name' && ui.drawer.kind === 'field') showErr('#fd-name', '#fd-name-e', t.value.trim() ? fieldNameError(t.value.trim()) : '');
			onDraftChange(); return;
		}
		if (t.dataset.dm && ui.drawer) { ui.drawer.draft.map[+t.dataset.i][t.dataset.dm] = t.value; onDraftChange(); return; }
		if (t.dataset.s && ui.sdraft) {
			const k = t.dataset.s; ui.sdraft[k] = t.value; showErr(`#${t.id}`, `#${t.id}-e`, '');
			if (k === 'change_history') { renderPane(); refocus(`st-${k}`); } updateSaveState(); refreshSettingsBar();
		}
	});
	ROOT.addEventListener('change', (e) => { const t = e.target; if (t.tagName === 'SELECT' && t.dataset.d && ui.drawer) { ui.drawer.draft[t.dataset.d] = t.value; if (['method', 'norm', 'fieldType'].includes(t.dataset.d)) rerender(); else onDraftChange(); } });
	ROOT.addEventListener('toggle', (e) => { if (e.target.dataset && e.target.dataset.actToggle === 'raw') { e.target.open ? ui.expanded.add('raw') : ui.expanded.delete('raw'); } if (e.target.id === 'sec-adv') ui.advOpen = e.target.open; }, true);

	ROOT.addEventListener('keydown', (e) => {
		const t = e.target;
		if (e.key === 'Escape' && $q('.tip.on')) { hideTips(); e.stopPropagation(); return; }
		if (t.dataset && t.dataset.chipInput) {
			const id = t.dataset.chipInput; const arr = chipArr(id); const err = $q(`[data-chip-err="${id}"]`);
			const after = () => (id === 'order' || id === 'ignore' || id === 'allowed' ? rerender() : refreshChips(id));
			if ((e.key === 'Enter' || e.key === ',') && t.value.trim()) {
				e.preventDefault(); const v = t.value.trim(); const m = chipError(id, v);
				if (m) { err.hidden = false; err.innerHTML = ico('alert') + `<span>${esc(m)}</span>`; t.closest('.chips').setAttribute('aria-invalid', 'true'); return; }
				if (arr.includes(v)) { err.hidden = false; err.innerHTML = ico('alert') + `<span>“${esc(v)}” is already in the list.</span>`; return; }
				arr.push(v); after(); refocus(`ci-${id}`); live(`Added ${v}`);
			} else if (e.key === 'Enter') { e.preventDefault(); }
			else if (e.key === 'Backspace' && !t.value && arr.length) { e.preventDefault(); const v = arr.pop(); after(); refocus(`ci-${id}`); live(`Removed ${v}`); }
			else if (e.key === 'Escape' && t.value) { t.value = ''; err.hidden = true; t.closest('.chips').removeAttribute('aria-invalid'); e.stopPropagation(); return; }
			else if (e.key !== 'Escape') return;
		}
		if (t.getAttribute && t.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
			const tabs = $$('[role=tab]'); let i = tabs.indexOf(t); i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
			e.preventDefault(); const id = tabs[i].dataset.tab; switchTab(id); setTimeout(() => { const n = $q(`#tab-${id}`); if (n) n.focus(); }, 30); return;
		}
		if (t.id === 'pick') { pickerKey(e, t); if (e.defaultPrevented) return; }
		if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey) && ui.drawer && ui.drawer.draft) { e.preventDefault(); saveDrawer(); return; }
		if (e.key === 'Escape') { if (modalState) return; if (ui.drawer) { e.preventDefault(); requestClose(); } return; }
		const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
		if (typing || e.metaKey || e.ctrlKey || e.altKey || modalState) return;
		if (e.key === '/' && ui.tab === 'fields' && !ui.drawer) { e.preventDefault(); const fl = $q('#f-filter'); if (fl) fl.focus(); }
		if (e.key === 'n' && !ui.drawer) { e.preventDefault(); const b = ui.tab === 'fields' ? $q('[data-act=addField]') : ui.tab === 'sources' ? $q('[data-act=addSource]') : null; if (b) b.click(); }
	});

	// Escape also closes the editor when the focus has landed on the page itself rather than inside the shadow root
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target === document.body && ui.drawer && !modalState) { e.preventDefault(); requestClose(); } });

	/* source picker (combobox) */
	let pickIdx = -1;
	function pickerInput(t) {
		const q = t.value.toLowerCase(); const lb = $q('#pick-list');
		const items = (S.lookups || []).filter((c) => !S.sources.some((s) => s.lookup === c.name) && (c.name.toLowerCase().includes(q) || c.app.toLowerCase().includes(q))).slice(0, 100);
		lb.innerHTML = items.length ? items.map((c, i) => `<div class="opt" role="option" id="po-${i}" data-lk="${esc(c.name)}" aria-selected="false"><span>${esc(c.name)}</span><small>${esc(c.app)}</small></div>`).join('') : `<div class="opt muted" role="option" aria-disabled="true">${S.lookups ? 'No lookups match' : 'Loading lookups…'}</div>`;
		lb.hidden = false; t.setAttribute('aria-expanded', 'true'); pickIdx = -1;
		lb.onmousedown = (ev) => { const o = ev.target.closest('[data-lk]'); if (o) { ev.preventDefault(); chooseLookup(o.dataset.lk); } };
	}
	function pickerKey(e, t) {
		const lb = $q('#pick-list'); const o = $$('[data-lk]', lb);
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (lb.hidden) pickerInput(t); const l = $$('[data-lk]', lb); if (!l.length) return; pickIdx = (pickIdx + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length; l.forEach((x, i) => x.setAttribute('aria-selected', i === pickIdx)); t.setAttribute('aria-activedescendant', l[pickIdx].id); l[pickIdx].scrollIntoView({ block: 'nearest' }); }
		else if (e.key === 'Enter' && pickIdx >= 0 && o[pickIdx]) { e.preventDefault(); chooseLookup(o[pickIdx].dataset.lk); }
		else if (e.key === 'Escape' && !lb.hidden) { e.preventDefault(); e.stopPropagation(); lb.hidden = true; t.setAttribute('aria-expanded', 'false'); }
	}
	async function chooseLookup(name) {
		const s = ui.drawer.draft; s.lookup = name; s.name = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+$/, ''); s.map = [];
		rerender(); setTimeout(() => { const p = $q('#pick'); if (p) p.focus(); }, 0);
		const st = await inspectLookup(name);
		if (ui.drawer && ui.drawer.draft === s) { s.map = (st.columns || []).filter((c) => S.fields.some((x) => x.name === c)).map((c) => ({ to: c, from: c })); ui.drawer.orig = JSON.stringify(Object.assign({}, s, { map: [] })); rerender(); live(`${name} selected. ${st.error ? 'It could not be read' : (st.columns || []).length + ' columns found'}`); }
	}
	ROOT.addEventListener('focusout', (e) => { if (e.target.id === 'pick') setTimeout(() => { const l = $q('#pick-list'); if (l && ROOT.activeElement !== e.target) l.hidden = true; }, 120); });
	ROOT.addEventListener('focusin', (e) => { if (e.target.id === 'pick' && !e.target.value) pickerInput(e.target); });

	/* ---------- Start ---------- */
	function init() {
		detectTheme(); renderHeader(); renderMain();
		loadConf().then(() => { renderHeader(); renderMain(); inspectAll(); refreshLines(); loadRuns().then(() => { renderHeader(); }); })
			.catch((err) => { $q('#main').innerHTML = `<div class="d-in"><div class="banner bad" role="alert">${ico('alert')}<div class="grow"><b>The configuration could not be read.</b><div class="muted">${esc(describeError(err))}</div></div></div></div>`; });
	}

	init();
});
