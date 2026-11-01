// Builds the AssetDB merge search from the assetdb.conf field array. Pure (no DOM, no REST) so it can be
// unit tested in Node and reused by every page that needs the generated SPL.
define([], function () {
	/**
	 * JSON.parse that returns `fallback` instead of throwing on malformed or non-string input.
	 */
	function safeParse(value, fallback) {
		try {
			const parsed = JSON.parse(value);
			return parsed == null ? fallback : parsed;
		} catch {
			return fallback;
		}
	}

	const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
	const SOURCE_NAME_RE = /^[A-Za-z0-9_.-]+$/;
	const LOOKUP_FILE_RE = /^[A-Za-z0-9_.-]+$/;
	const SOURCE_ROLES = ['authoritative', 'enrich'];
	const SCOPE_RE = /^[A-Za-z0-9_.-]+$/;
	// relative_time offset such as 30d, 12h, 6mon
	const MAX_AGE_RE = /^[1-9]\d*(s|m|h|d|w|mon|q|y)$/;
	// A lookup column name as written in SPL between single quotes.
	const COLUMN_RE = /^[^'"\\|`[\]\r\n]+$/;
	const MERGE_ORDER_RE = /^[A-Za-z0-9_]+$/;
	const MERGE_METHODS = ['latest', 'earliest', 'min', 'max', 'avg', 'sum', 'coalesce'];
	const DEFAULT_MAX_KEYS = 25;
	const DEFAULT_MAX_KEY_SHARE = 50;
	// The run is refused (the asset database is left as it was) when it produces fewer than this fraction of the
	// assets of the last successful run. 0 turns the check off.
	const DEFAULT_MIN_RATIO = 0.5;
	const DEFAULT_RUNS_TO_KEEP = 200;
	const MAX_RUNS_TO_KEEP = 5000;
	const RUN_COUNTERS = ['adb_total', 'adb_null_keys', 'adb_large_keys', 'adb_enrich_unmatched', 'adb_enrich_ambiguous', 'adb_junk_keys', 'adb_junk_rows'];
	const DEFAULT_KEY_BLOCKLIST = [
		'00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff', 're:^(00[:-]?){5}00$', 're:^(ff[:-]?){5}ff$',
		'0.0.0.0', '::', '::1', 'localhost', 'localhost.localdomain',
		'unknown', 'none', 'null', 'n/a', 'na', 'undefined', '-',
		'cidr:127.0.0.0/8', 'cidr:169.254.0.0/16',
	];
	const CIDR_RE = /^[0-9a-fA-F:.]+\/\d{1,3}$/;
	// Normaliser presets: each maps to a macro in macros.conf that rewrites every value of one field.
	const NORMALIZERS = {
		none: null,
		trim: 'normalize_trim',
		mac: 'normalize_mac',
		ip: 'normalize_ip',
		hostname: 'normalize_hostname',
		fqdn: 'normalize_fqdn',
		user: 'normalize_user',
		email: 'normalize_email',
		os: 'normalize_os',
	};
	const LOWERCASING_NORMALIZERS = ['hostname', 'fqdn', 'user', 'email', 'os'];
	// Typed validation: values that do not match are dropped (anchored regexes, evaluated with SPL match()).
	const IPV4 = '((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)';
	const IPV6 = '(?=.*:.*:)[0-9a-fA-F:.]+(%\\w+)?';
	const HOSTNAME = '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
	const VALIDATION_TYPES = {
		none: null,
		ipv4: `^${IPV4}$`,
		ipv6: `^${IPV6}$`,
		ip: `^(${IPV4}|${IPV6})$`,
		mac: '^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$',
		email: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
		hostname: `^${HOSTNAME}$`,
		fqdn: `^(${HOSTNAME}\\.)+[A-Za-z]{2,}$`,
		cidr: `^${IPV4}/(3[0-2]|[12]?\\d)$`,
		integer: '^-?\\d+$',
		number: '^-?\\d+(\\.\\d+)?$',
	};
	const VALUE_TYPES = ['string', 'number', 'bool', 'time', 'cidr'];
	// The adbmerge command keeps every key set in memory; beyond this the merge is too expensive, so it is a hard limit.
	const HARD_MAX_KEYS = 100;

	/**
	 * Quote a value as an SPL string literal (escapes backslashes and double quotes).
	 */
	function splQuote(value) {
		return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
	}

	/**
	 * Throw unless an eval expression stays inside one eval: outside of string literals it
	 * may not contain pipes, backticks or square brackets (which would start a new command,
	 * macro or subsearch).
	 */
	function checkEvalExpression(expression) {
		let quote = null;
		const text = String(expression);
		for (let i = 0; i < text.length; i++) {
			const c = text[i];
			if (quote) {
				if (c === '\\') i++;
				else if (c === quote) quote = null;
			} else if (c === '"' || c === "'") {
				quote = c;
			} else if ('|`[]'.includes(c)) {
				throw new Error(`Invalid eval expression: "${c}" is only allowed inside quotes`);
			}
		}
		if (quote) throw new Error('Invalid eval expression: unterminated string');
	}

	// Field names that would collide with the [general] stanza or with Splunk's own fields.
	const RESERVED_FIELD_NAMES = ['general', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts', '_key', '_time', '_raw', 'host', 'index', 'sourcetype', 'linecount', 'punct', 'splunk_server', 'timestartpos', 'timeendpos'];

	function isReservedFieldName(name) {
		return RESERVED_FIELD_NAMES.includes(String(name).toLowerCase());
	}

	/**
	 * A source is enabled unless `enabled` is explicitly false/0 (older configs have no such property).
	 */
	function sourceEnabled(source) {
		const v = source.enabled;
		return !(v === false || v === 0 || ['0', 'false', 'no'].includes(String(v).toLowerCase()));
	}

	/**
	 * Throw unless the parentheses of an expression balance outside string literals, so it can be wrapped in
	 * another condition without its own `)` escaping the wrapper.
	 */
	function checkBalancedParens(expression) {
		let depth = 0;
		let quote = null;
		const text = String(expression);
		for (let i = 0; i < text.length; i++) {
			const c = text[i];
			if (quote) {
				if (c === '\\') i++;
				else if (c === quote) quote = null;
			} else if (c === '"' || c === "'") quote = c;
			else if (c === '(') depth++;
			else if (c === ')' && --depth < 0) throw new Error('Invalid row filter: unbalanced parentheses');
		}
		if (depth !== 0) throw new Error('Invalid row filter: unbalanced parentheses');
	}

	/**
	 * mvappend() needs at least two arguments in SPL (one is an error); a single item is used as is.
	 */
	function mvappendOf(items) {
		return items.length === 1 ? items[0] : `mvappend(${items.join(', ')})`;
	}

	/**
	 * mvfilter() clause that drops every value of `name` matching one of the entries. An entry is an exact value,
	 * `re:<regex>` or `cidr:<network>`; exact values and regexes are compared lowercased unless `caseSensitive`.
	 *
	 * @return {String}	The assignment `name = mvfilter(NOT (...))`, or '' when there are no entries
	 */
	function valueFilter(name, entries, caseSensitive, label) {
		if (!entries.length) return '';
		const cmp = caseSensitive ? name : `lower(${name})`;
		const exact = [];
		const tests = [];
		for (const entry of entries) {
			const text = String(entry);
			if (text.startsWith('re:')) {
				const pattern = text.slice(3);
				try { new RegExp(pattern); } catch { throw new Error(`Invalid ${label} regex "${pattern}" for field ${name}`); }
				tests.push(`match(${cmp}, ${splQuote(caseSensitive ? pattern : pattern.toLowerCase())})`);
			} else if (text.startsWith('cidr:')) {
				const network = text.slice(5);
				if (!CIDR_RE.test(network)) throw new Error(`Invalid ${label} CIDR "${network}" for field ${name}`);
				tests.push(`cidrmatch(${splQuote(network)}, ${name})`);
			} else {
				exact.push(splQuote(caseSensitive ? text : text.toLowerCase()));
			}
		}
		if (exact.length) tests.unshift(`in(${cmp}, ${exact.join(', ')})`);
		return `${name} = mvfilter(NOT (${tests.join(' OR ')}))`;
	}

	/**
	 * The key blocklist: values that are never used to match assets (placeholders, loopback, shared addresses).
	 * An explicit `key_blocklist` in [general] replaces the defaults, including an empty list.
	 */
	function getKeyBlocklist(general) {
		if (general.key_blocklist === undefined || general.key_blocklist === null) return DEFAULT_KEY_BLOCKLIST.slice();
		const parsed = safeParse(general.key_blocklist, null);
		return Array.isArray(parsed) ? parsed : DEFAULT_KEY_BLOCKLIST.slice();
	}

	/**
	 * min_ratio (0 to 1) of the safety check against the last successful run.
	 */
	function parseMinRatio(general) {
		const n = parseFloat(general.min_ratio);
		return isNaN(n) || n < 0 || n > 1 ? DEFAULT_MIN_RATIO : n;
	}

	function parseRunsToKeep(general) {
		const n = parseInt(general.runs_to_keep);
		return isNaN(n) || n < 1 ? DEFAULT_RUNS_TO_KEEP : Math.min(n, MAX_RUNS_TO_KEEP);
	}

	/**
	 * max_key_share for adbmerge: keys found in more than this many input rows are not used to match (0 disables).
	 */
	function parseMaxKeyShare(general) {
		const n = parseInt(general.max_key_share);
		return isNaN(n) || n < 0 ? DEFAULT_MAX_KEY_SHARE : Math.min(n, 1000000);
	}

	/**
	 * max_keys for adbmerge from the [general] stanza of assetdb.conf: a positive integer, default 25.
	 */
	function parseMaxKeys(fieldArray) {
		const general = fieldArray.find((obj) => obj.name === 'general');
		const n = parseInt(general?.content?.max_keys);
		return isNaN(n) || n < 1 ? DEFAULT_MAX_KEYS : Math.min(n, HARD_MAX_KEYS);
	}

	/**
	 * Number of values to keep for a multivalue field: a positive integer, default 10.
	 */
	function parseMaxValues(value) {
		const n = parseInt(value);
		return isNaN(n) ? 10 : Math.min(100, Math.max(1, n));
	}

	/**
	 * Get lookupArray from fieldArray
	 *
	 * @param {Array}	fieldArray		Array of field data from assetdb.conf
	 */
	function getLookupArray(fieldArray) {
		let general = fieldArray.find((obj) => {
			return obj.name === 'general';
		});

		if (general?.content?.lookups == undefined || general?.content?.lookups == '') return [];

		const parsed = safeParse(general.content.lookups, null);
		if (Array.isArray(parsed)) return parsed;
		return general.content.lookups.split(',').map(lookup => {return {name: lookup, lookup: lookup}});
	}

	/**
	 * Read-only searches that show what the merge would produce, built from the generated lines: everything up to and
	 * including the adbmerge command (so nothing is written) followed by a small summary tail.
	 *
	 * @param {Array}	lines	Lines from buildSearchLines
	 * @return {Object}		{ summary, clusters, sources, current } SPL strings
	 */
	function buildPreviewSearches(lines) {
		const at = lines.findIndex((line) => line.kind === 'command' && line.text.startsWith('| where (isnull(adb_light)'));
		if (at < 0) throw new Error('The merge search has no adbmerge step to preview');
		const base = lines.slice(0, at + 1).filter((line) => line.kind === 'command').map((line) => line.text).join('\n');
		return {
			summary: `${base}\n| stats dc(eval(if(isnull(adb_overflow), md5(mvjoin(mvsort(asset), "::")), null()))) as assets, count(eval(adb_overflow=1)) as overflow_clusters, max(adb_total) as merge_inputs, max(adb_null_keys) as rows_without_keys, max(adb_junk_keys) as shared_keys_skipped, max(adb_junk_rows) as rows_dropped_for_shared_keys, max(adb_enrich_unmatched) as enrich_unmatched, max(adb_enrich_ambiguous) as enrich_ambiguous`,
			clusters: `${base}\n| where isnull(adb_overflow) | eval keys=mvcount(asset), adb_id=md5(mvjoin(mvsort(asset), "::")) | dedup adb_id | sort 0 -keys | head 10 | table asset keys source`,
			sources: `${base}\n| where isnull(adb_overflow) | eval adb_id=md5(mvjoin(mvsort(asset), "::")) | mvexpand source | stats dc(adb_id) as assets by source | sort 0 -assets`,
			current: '| inputlookup assetdb | stats count as assets',
		};
	}

	/**
	 * The merge up to the asset table without any write, compared with the assetdb it would replace: one row per asset that
	 * would be added, removed or changed (and which fields changed). The side effects of the real search (overflow list, run
	 * record, the assetdb itself) are the lines that write, so dropping those lines is what makes it read
	 * only. The safety check is left out on purpose so the preview still shows the difference of a run that would be blocked.
	 *
	 * @param {Array}	lines	Lines from buildSearchLines
	 * @return {String}		SPL; ends with `| table change asset changed_fields`
	 */
	function buildPreviewDiff(lines) {
		const outputLine = lines.find((line) => line.kind === 'command' && /^\| table _key, asset, source, source_lookup, last_seen/.test(line.text));
		if (!outputLine) throw new Error('The merge search has no asset table to compare');
		const fixed = ['_key', 'asset', 'source', 'source_lookup', 'last_seen', 'scope', 'conflicts'];
		const table = outputLine.text.replace(/^\| table /, '').split(', ').map((n) => n.trim()).filter((n) => !fixed.includes(n));
		if (!table.length) throw new Error('The merge search has no fields to compare');
		const guard = '| where isnull(adb_is_marker) AND isnull(adb_is_prev) AND adb_guard=0';
		const writes = /\boutputlookup\b|\|\s*collect\b/;
		const base = lines.filter((line) => line.kind === 'command' && !writes.test(line.text)).map((line) => (line.text === guard ? guard.replace(' AND adb_guard=0', '') : line.text)).join('\n');
		const hashes = table.map((n) => `adbh_${n}=md5(coalesce(mvjoin(mvsort(${n}), "|"), ""))`).join(', ');
		const hashNames = table.map((n) => `adbh_${n}`);
		const changedFields = mvappendOf(table.map((n) => `if(mvcount(adbh_${n}) > 1, "${n}", null())`));
		return `${base}\n| eval adb_side="new" | inputlookup append=true assetdb | eval adb_side=coalesce(adb_side, "old"), ${hashes} | fields _key adb_side asset ${hashNames.join(' ')}`
			+ ' | eventstats count(eval(adb_side="new")) as adb_n_new | where adb_n_new > 0'
			+ ` | stats values(adb_side) as sides, latest(asset) as asset, ${hashNames.map((h) => `values(${h}) as ${h}`).join(', ')} by _key`
			+ ' | eval change=case(mvcount(sides)=1 AND sides="new", "added", mvcount(sides)=1 AND sides="old", "removed", true(), "changed")'
			+ ` | eval changed_fields=if(change="changed", ${changedFields}, null()) | where change!="changed" OR isnotnull(changed_fields)`
			+ ' | sort 0 change | table change asset changed_fields';
	}

	/**
	 * CIM-shaped asset fields (the names of the Splunk Common Information Model / ES asset schema) with sensible
	 * defaults. Only names and defaults: nothing here needs the CIM add-on or Enterprise Security.
	 */
	function cimPresetFields() {
		const base = { key_field: '0', case_sensitive: '1', ignore_values: '[]', fillnull: '', validation: '', field_type: 'single', merge_method: 'latest', merge_order: '', max_values: '10', eval_expression: '', mv_order: 'recent', normalizer: 'default', validation_type: 'none', value_type: 'string', keep_case: '0', key_scope: 'global', inherit_ignore: '1', allowed_sources: '', track_conflicts: '0', description: '' };
		const make = (name, description, extra) => ({ name, content: Object.assign({}, base, { description }, extra) });
		return [
			make('ip', 'IP addresses of the asset', { key_field: '1', case_sensitive: '0', field_type: 'multivalue', normalizer: 'ip', validation_type: 'ip' }),
			make('mac', 'MAC addresses of the asset', { key_field: '1', case_sensitive: '0', field_type: 'multivalue', normalizer: 'mac', validation_type: 'mac' }),
			make('nt_host', 'Short host name (NetBIOS / Windows host name)', { key_field: '1', case_sensitive: '0', field_type: 'multivalue', normalizer: 'hostname' }),
			make('dns', 'Fully qualified DNS names', { key_field: '1', case_sensitive: '0', field_type: 'multivalue', normalizer: 'fqdn' }),
			make('owner', 'Person or team that owns the asset', { track_conflicts: '1' }),
			make('priority', 'Business priority: low, medium, high, critical', { case_sensitive: '0' }),
			make('bunit', 'Business unit', { case_sensitive: '0' }),
			make('category', 'Categories the asset belongs to (server, desktop, ...)', { case_sensitive: '0', field_type: 'multivalue' }),
			make('city', 'City where the asset is located'),
			make('country', 'Country where the asset is located'),
			make('pci_domain', 'PCI domains the asset is part of', { case_sensitive: '0', field_type: 'multivalue' }),
			make('is_expected', 'Whether the asset is expected to be seen (true or false)', { case_sensitive: '0' }),
		];
	}

	/**
	 * Build the merge search as typed lines {kind: 'comment' | 'command', text} from the field array
	 * (the entries of the assetdb.conf REST listing, including the [general] stanza).
	 */
	function buildSearchLines(fieldArray) {

		let fieldSplit = [];
		let coalesce = [];
		let multivalue = [];
		let stats = [];
		let statsFinal = [];
		let avgEval = [];
		let usesLatest = false;
		let recentMv = false;
		let conflictFields = [];
		let dedupMv = [];
		let evalExp = [];
		let keys = [];
		let table = [];
		let fillnull = [];
		let validation = [];
		let ignoreValues = [];
		let caseInsensitive = [];
		let maxValues = [];

		const general = (fieldArray.find((e) => e.name === 'general') || {}).content || {};
		let normalize = [];
		let allowedSources = [];
		let typed = [];
		let earliestEval = [];
		let earliestFinal = [];
		let keyTemps = [];
		let keyFields = [];
		let blocklistClauses = [];
		const keyBlocklist = getKeyBlocklist(general);
		// Sources: only enabled ones take part. Per source options are applied to that source's rows only (source_lookup test).
		const lookupsArray = getLookupArray(fieldArray).filter(sourceEnabled);
		const rowFilters = [];
		const ageFilters = [];
		const timeMaps = [];
		const columnMaps = {};
		const enrichLookups = [];
		const staticScopes = [];
		const scopeColumn = general.scope_field ? String(general.scope_field).trim() : '';
		if (scopeColumn && !COLUMN_RE.test(scopeColumn)) throw new Error(`Invalid scope field "${scopeColumn}"`);
		let scopedKeys = [];
		for (const src of lookupsArray) {
			const {lookup, name} = src;
			if (!LOOKUP_FILE_RE.test(lookup)) throw new Error(`Invalid lookup "${lookup}"`);
			if (!SOURCE_NAME_RE.test(name)) throw new Error(`Invalid lookup input name "${name}"`);
			const isThis = `source_lookup=${splQuote(lookup)}`;
			const notThis = `source_lookup!=${splQuote(lookup)}`;

			const role = src.role || 'authoritative';
			if (!SOURCE_ROLES.includes(role)) throw new Error(`Invalid role "${role}" for source ${name}`);
			if (role === 'enrich') enrichLookups.push(lookup);

			if (src.filter) {
				checkEvalExpression(src.filter);
				checkBalancedParens(src.filter);
				rowFilters.push(`(${notThis} OR (${src.filter}))`);
			}
			if (src.time_field) {
				if (!COLUMN_RE.test(src.time_field)) throw new Error(`Invalid time column "${src.time_field}" for source ${name}`);
				timeMaps.push(`${isThis}, tonumber('${src.time_field}')`);
			}
			if (src.max_age) {
				if (!MAX_AGE_RE.test(src.max_age)) throw new Error(`Invalid max age "${src.max_age}" for source ${name} (use e.g. 30d, 12h, 6mon)`);
				ageFilters.push(`(${notThis} OR isnull(_time) OR _time >= relative_time(now(), "-${src.max_age}"))`);
			}
			if (src.scope) {
				if (!SCOPE_RE.test(src.scope)) throw new Error(`Invalid scope "${src.scope}" for source ${name} (letters, digits, _ . -)`);
				staticScopes.push(`${isThis}, ${splQuote(src.scope.toLowerCase())}`);
			}
			const columns = src.columns && typeof src.columns === 'object' ? src.columns : {};
			for (const [target, column] of Object.entries(columns)) {
				if (!FIELD_NAME_RE.test(target)) throw new Error(`Invalid field name "${target}" in the column mapping of source ${name}`);
				if (!COLUMN_RE.test(column)) throw new Error(`Invalid column "${column}" in the column mapping of source ${name}`);
				(columnMaps[target] = columnMaps[target] || []).push(`${isThis}, '${column}'`);
			}
		}
		const usesScope = staticScopes.length > 0 || !!scopeColumn;
		const lookupFiles = lookupsArray.map(({lookup}) => `| \`input_adb_lookup(${lookup})\``);
		const lookupNames = lookupsArray.map(({lookup, name}) => `source_lookup=${splQuote(lookup)}, ${splQuote(name)}`);

		for (const field of fieldArray) {
			const {name, content} = field;
			if (name == 'general') continue;
			// A disabled field (enabled=0) is left out of the merge but keeps its settings; configs without the property are enabled.
			if (['0', 'false', 'no'].includes(String(content.enabled).toLowerCase())) continue;
			if (!FIELD_NAME_RE.test(name)) throw new Error(`Invalid field name "${name}"`);
			if (content.merge_method && !MERGE_METHODS.includes(content.merge_method)) throw new Error(`Invalid merge method "${content.merge_method}" for field ${name}`);

			const isKey = !!parseInt(content.key_field);
			// Case rule: an explicit value wins, otherwise the global default (insensitive when neither is set).
			const hasCase = content.case_sensitive !== undefined && content.case_sensitive !== '';
			const caseSensitive = !!parseInt(hasCase ? content.case_sensitive : (general.default_case_sensitive || 0));
			// Keep the original case in the stored value and lowercase only for matching (key fields only).
			const keepCase = isKey && !caseSensitive && !!parseInt(content.keep_case || 0);

			let normalizer = content.normalizer;
			if (!normalizer || normalizer === 'default') normalizer = general.default_normalizer || 'none';
			if (!(normalizer in NORMALIZERS)) throw new Error(`Invalid normalizer "${normalizer}" for field ${name}`);
			// These presets lowercase every value, so they would silently destroy the original case that Keep Original Case promises.
			if (keepCase && LOWERCASING_NORMALIZERS.includes(normalizer)) throw new Error(`Field ${name}: Keep Original Case cannot be combined with the ${normalizer} normalizer, which lowercases the value`);
			if (NORMALIZERS[normalizer]) normalize.push(`| \`${NORMALIZERS[normalizer]}(${name})\``);

			const validationType = content.validation_type || 'none';
			if (!(validationType in VALIDATION_TYPES)) throw new Error(`Invalid validation type "${validationType}" for field ${name}`);
			if (VALIDATION_TYPES[validationType]) validation.push(`${name}=mvfilter(match(${name}, ${splQuote(VALIDATION_TYPES[validationType])}))`);
			if (content.value_type && !VALUE_TYPES.includes(content.value_type)) throw new Error(`Invalid value type "${content.value_type}" for field ${name}`);

			if (isKey) {
				keys.push(name);
				keyFields.push(name);
				if (content.key_scope === 'scoped') scopedKeys.push(`adbk_${name}`);
				keyTemps.push(`adbk_${name} = ${keepCase ? `lower(${name})` : name}`);
				const blocked = valueFilter(`adbk_${name}`, keyBlocklist, caseSensitive && !keepCase, 'key blocklist');
				if (blocked) blocklistClauses.push(blocked);
			}

			// Ignore list: the field's own entries plus the global list (unless the field opts out). An entry is an exact
			// value, `re:<regex>` or `cidr:<network>`. Exact values and regexes are compared lowercased on case insensitive fields.
			const ownIgnored = content.ignore_values ? safeParse(content.ignore_values, null) : null;
			const inheritIgnore = content.inherit_ignore === undefined || content.inherit_ignore === '' ? true : !!parseInt(content.inherit_ignore);
			const globalIgnored = inheritIgnore ? safeParse(general.ignore_values, []) : [];
			if (Array.isArray(ownIgnored)) {
				const clause = valueFilter(name, ownIgnored.concat(Array.isArray(globalIgnored) ? globalIgnored : []), caseSensitive, 'ignore');
				if (clause) ignoreValues.push(clause);
			}

			// Allowed sources: values from any other source are discarded before the merge.
			const allowed = (content.allowed_sources || '').split(',').map((x) => x.trim()).filter(Boolean);
			for (const src of allowed) {
				if (!SOURCE_NAME_RE.test(src)) throw new Error(`Invalid allowed source "${src}" for field ${name}`);
			}
			if (allowed.length) allowedSources.push(`${name} = if(in(source, ${allowed.map(splQuote).join(', ')}), ${name}, null())`);

			if (content?.fillnull && !parseInt(content.key_field)) {
				fillnull.push(`${name} = if(isnull(${name}), ${splQuote(content.fillnull)}, ${name})`);
			}

			if (content.validation) {
				validation.push(`${name}=mvfilter(match(${name}, ${splQuote(content.validation)}))`);
			}

			if (content.eval_expression) {
				checkEvalExpression(content.eval_expression);
				evalExp.push(`${name} = ${content.eval_expression}`);
			}

			if (!caseSensitive && !keepCase) {
				caseInsensitive.push(name);
			}

			if (content.field_type == 'single' && parseInt(content.track_conflicts || 0)) {
				conflictFields.push(name);
				stats.push(`values(${name}) as ${name}__v`);
				statsFinal.push(`values(${name}__v) as ${name}__v`);
			}

			if (content.field_type == 'single' && ['number', 'time'].includes(content.value_type)) typed.push(`${name} = tonumber(${name})`);

			if (content.field_type == 'single') {
				if (content.merge_method == 'latest') {
					usesLatest = true;
					stats.push(`latest(${name}) as ${name}`);
					statsFinal.push(`latest(${name}) as ${name}`);

				} else if (content.merge_method == 'coalesce') {
					fieldSplit.push(`{source}_${name} = ${name}`);

					const mergeOrderArray = content.merge_order.split(',');
					for (const lookup of mergeOrderArray) {
						if (!MERGE_ORDER_RE.test(lookup)) throw new Error(`Invalid merge order entry "${lookup}" for field ${name}`);
					}
					usesLatest = true;
					const perLookup = mergeOrderArray.map((lookup) => `latest(${lookup}_${name}) as ${lookup}_${name}`);
					stats = stats.concat(perLookup);
					statsFinal = statsFinal.concat(perLookup);

					const postEvalMerge = mergeOrderArray.map((lookup) => `'${lookup}_${name}'`);
					coalesce.push(`${name} = coalesce(${postEvalMerge.join(', ')})`);

				} else if (content.merge_method == 'earliest') {
					// Exact first value without relying on event order: prefix each value with its zero padded time,
					// take the lexicographic min through both stats, then strip the prefix.
					earliestEval.push(`${name}__e = if(isnotnull(${name}), printf("%015.3f", coalesce(_time, 0)) . "|" . ${name}, null())`);
					stats.push(`min(${name}__e) as ${name}__e`);
					statsFinal.push(`min(${name}__e) as ${name}__e`);
					earliestFinal.push(`${name} = replace(${name}__e, "^[^|]*\\|", "")`);
				} else if (content.merge_method == 'avg') {
					// An average of per-group averages is wrong for unequal groups: carry sum and count instead.
					stats.push(`sum(${name}) as ${name}__sum, count(${name}) as ${name}__count`);
					statsFinal.push(`sum(${name}__sum) as ${name}__sum, sum(${name}__count) as ${name}__count`);
					avgEval.push(`${name} = ${name}__sum / ${name}__count`);
				} else {
					stats.push(`${content.merge_method}(${name}) as ${name}`);
					statsFinal.push(`${content.merge_method}(${name}) as ${name}`);
				}
			} else if (content.field_type == 'multivalue') {
				multivalue.push(name);
				if (content.mv_order === 'alpha') {
					stats.push(`values(${name}) as ${name}`);
					statsFinal.push(`values(${name}) as ${name}`);
				} else {
					// Most recent first without sorting anything: every value is prefixed with its zero padded row time, values()
					// de-duplicates and has no size limit (list() stops at 100 entries, so duplicates could push real values out), and the
					// prefixes sort chronologically. After the final stats the values are sorted newest first, de-duplicated and stripped.
					recentMv = true;
					stats.push(`values(${name}) as ${name}`);
					statsFinal.push(`values(${name}) as ${name}`);
					dedupMv.push(name);
				}
				maxValues.push(`${name} = mvindex(${name},0,${parseMaxValues(content.max_values) - 1})`);
			}
			table.push(name);
		};

		const lines = [];
		const section = (title) => lines.push({ kind: 'comment', text: `\`\`\`### ${title} ###\`\`\`` });
		const command = (text) => lines.push({ kind: 'command', text });

		lookupFiles.forEach(command);
		if (lookupNames.length) { section('Map source lookup to source name'); command(`| eval source=case(${lookupNames.join(', ')})`); }
		if (enrichLookups.length) { section('Mark rows from enrich-only sources (they never create or link assets)'); command(`| eval adb_auth=case(${enrichLookups.map((l) => `source_lookup=${splQuote(l)}, 0`).join(', ')}, true(), 1)`); }
		if (rowFilters.length) { section('Row filters (written against the source columns)'); command(`| where ${rowFilters.join(' AND ')}`); }
		if (timeMaps.length) { section('Time columns of sources that do not use _time'); command(`| eval _time=case(${timeMaps.join(', ')}, true(), _time)`); }
		if (ageFilters.length) { section('Drop rows older than a source\'s max age'); command(`| where ${ageFilters.join(' AND ')}`); }
		if (Object.keys(columnMaps).length) {
			section('Map source columns to fields');
			command(`| eval ${Object.entries(columnMaps).map(([target, cases]) => `${target} = case(${cases.join(', ')}, true(), ${target})`).join(', ')}`);
		}
		if (usesScope) {
			section('Scope (site or tenant) of each row');
			command(`| eval scope = lower(case(${staticScopes.concat(['true()', scopeColumn ? `'${scopeColumn}'` : 'null()']).join(', ')}))`);
		}
		if (allowedSources.length) { section('Discard values from sources a field does not accept'); command(`| eval ${allowedSources.join(', ')}`); }
		// Source lookups often have many columns the merge never uses. Drop them as early as possible; an eval expression may
		// read any column, so with expressions the pruning waits until after they ran.
		const keepColumns = () => `| fields ${['_time', 'source', 'source_lookup'].concat(usesScope ? ['scope'] : [], enrichLookups.length ? ['adb_auth'] : [], table).join(', ')}`;
		if (!evalExp.length && table.length) { section('Keep only the columns the merge uses'); command(keepColumns()); }
		if (multivalue.length) { section('Split multivalue fields'); command(`| foreach ${multivalue.join(', ')} [eval <<FIELD>>=split(<<FIELD>>, "|")]`); }
		if (normalize.length) { section('Normalize values'); normalize.forEach(command); }
		if (caseInsensitive.length) { section('Convert case insensitive fields to lowercase'); command(`| foreach ${caseInsensitive.join(', ')} [eval <<FIELD>>=lower(<<FIELD>>)]`); }
		if (validation.length) { section('Validate field values'); command(`| eval ${validation.join(', ')}`); }
		if (ignoreValues.length) { section('Ignore values'); command(`| eval ${ignoreValues.join(', ')}`); }
		if (evalExp.length) {
			section('Eval expression fields');
			command(`| eval ${evalExp.join(', ')}`);
			if (table.length) { section('Keep only the columns the merge uses'); command(keepColumns()); }
		}
		if (typed.length) { section('Convert numeric fields'); command(`| eval ${typed.join(', ')}`); }
		if (earliestEval.length) { section('Tag values with their time (for the earliest merge method)'); command(`| eval ${earliestEval.join(', ')}`); }
		if (fieldSplit.length) { section('Create lookup specific fields for priority based coalesce'); command(`| eval ${fieldSplit.join(', ')}`); }
		const keyRefs = keyFields.map((n) => `adbk_${n}`);
		if (keys.length) {
			section('Build match keys (lowercased where the field is case insensitive)');
			command(`| eval ${keyTemps.join(', ')}`);
			if (blocklistClauses.length) { section('Remove blocklisted values from the match keys'); command(`| eval ${blocklistClauses.join(', ')}`); }
			if (usesScope && scopedKeys.length) {
				section('Prefix scoped keys with the row scope (the same value in two sites is two different assets)');
				command(`| eval ${scopedKeys.map((k) => `${k} = if(isnotnull(scope), mvmap(${k}, scope . "|" . ${k}), ${k})`).join(', ')}`);
			}
			section('Shallow merge assets with matching key fields (using basic stats)');
			command('| eval _key = ' + (keyRefs.length == 1 ? keyRefs[0] : `mvjoin(mvdedup(mvappend(${keyRefs.join(', ')})), "::")`));
		}
		command('| search _key=*');
		if (recentMv) {
			section('Tag multivalue values with their time (so the most recent ones can be kept)');
			command(`| eval ${dedupMv.map((n) => `${n} = mvmap(${n}, printf("%015.3f", coalesce(_time, 0)) . "|" . ${n})`).join(', ')}`);
		}
		// _time is carried through the first stats so that `latest` still has a timestamp in the final stats
		if (stats.length) command(`| stats values(source) as source, values(source_lookup) as source_lookup, max(_time) as last_seen, ${(usesScope ? ['values(scope) as scope'] : []).concat(usesLatest ? ['latest(_time) as _time'] : []).concat(enrichLookups.length ? ['max(adb_auth) as adb_auth'] : [], keyRefs.map((k) => `values(${k}) as ${k}`), stats).join(', ')} by _key`);
		if (keys.length) { section('Deep merge assets with matching key fields (using custom command)'); command('| eval _key = ' + (keyRefs.length == 1 ? keyRefs[0] : `mvappend(${keyRefs.join(', ')})`)); }
		// adbmerge only needs the keys, so only the keys travel through the command (every column would otherwise be serialized
		// twice, in and out, which was the largest single cost); its answer is joined back to the full rows by a row id.
		section('Merge: only the keys go through adbmerge, the result is joined back by row id');
		command('| streamstats count as adb_rid');
		command(`| appendpipe [| fields adb_rid, _key, adb_auth | adbmerge max_keys=${parseMaxKeys(fieldArray)}${parseMaxKeyShare(general) ? ` max_key_share=${parseMaxKeyShare(general)}` : ''} overflow=emit | eval adb_light=1]`);
		command(`| eventstats values(asset) as asset, ${RUN_COUNTERS.map((c) => `max(${c}) as ${c}`).join(', ')} by adb_rid`);
		command('| where (isnull(adb_light) AND isnotnull(asset)) OR adb_overflow=1');
		section('Clusters that were too large to merge go to assetdb_overflow for review, not into assetdb');
		command('| appendpipe [| where adb_overflow=1 | eval _key=md5(mvjoin(asset, "::")), run_time=now() | rename adb_cluster_keys as cluster_keys, adb_cluster_rows as cluster_rows | table _key asset cluster_keys cluster_rows source source_lookup run_time | outputlookup assetdb_overflow | where 1=0]');
		command('| where isnull(adb_overflow)');
		command('| eval _key = md5(mvjoin(mvsort(asset), "::"))');
		if (stats.length) command(`| stats values(asset) as asset, values(source) as source, values(source_lookup) as source_lookup, max(last_seen) as last_seen, ${(usesScope ? ['values(scope) as scope'] : []).concat(RUN_COUNTERS.map((c) => `max(${c}) as ${c}`), statsFinal).join(', ')} by _key`);
		if (avgEval.length) { section('Calculate averages'); command(`| eval ${avgEval.join(', ')}`); }
		if (conflictFields.length) {
			section('Flag fields whose sources disagree');
			command(`| eval conflicts = ${mvappendOf(conflictFields.map((n) => `if(mvcount(${n}__v) > 1, "${n}", null())`))}`);
		}
		if (earliestFinal.length) { section('Pick the earliest values'); command(`| eval ${earliestFinal.join(', ')}`); }
		if (coalesce.length) { section('Define coalesce fields based on lookup priority'); command(`| eval ${coalesce.join(', ')}`); }
		if (dedupMv.length) { section('Newest values first: sort, de-duplicate and strip the time prefix'); command(`| eval ${dedupMv.map((n) => `${n} = mvdedup(mvmap(mvreverse(mvsort(${n})), replace(${n}, "^[^|]*\\|", "")))`).join(', ')}`); }
		if (fillnull.length) { section('Fill null values (after the merge, only where an asset has no value at all)'); command(`| eval ${fillnull.join(', ')}`); }
		if (maxValues.length) { section('Trim multivalue fields'); command(`| eval ${maxValues.join(', ')}`); }
		if (stats.length) {
			const minRatio = parseMinRatio(general);
			const keep = parseRunsToKeep(general);
			section('Run safety: how many assets did the last successful run produce?');
			command('| eventstats count as adb_assets_out');
			// a marker row keeps the stream (and so the run record) alive when no asset is produced at all
			command('| append [| makeresults | eval adb_is_marker=1 | table adb_is_marker]');
			command('| append [| inputlookup assetdb_runs | where status="ok" | sort 0 -run_time | head 1 | eval adb_is_prev=1 | rename assets_out as adb_prev_out | table adb_is_prev adb_prev_out]');
			command('| eventstats max(adb_prev_out) as adb_prev, max(adb_assets_out) as adb_assets_out');
			command(`| eval adb_guard = if(isnotnull(adb_prev) AND adb_assets_out < adb_prev * ${minRatio}, 1, 0)`);
			section(`Record this run in assetdb_runs (the last ${keep} runs are kept)`);
			command('| appendpipe [| stats max(adb_assets_out) as assets_out, max(adb_prev) as assets_prev, max(adb_guard) as guard, max(adb_total) as rows_in, max(adb_null_keys) as null_keys, max(adb_large_keys) as overflow_assets, max(adb_enrich_unmatched) as enrich_unmatched, max(adb_enrich_ambiguous) as enrich_ambiguous, max(adb_junk_keys) as junk_keys, max(adb_junk_rows) as junk_rows'
				+ ` | eval run_time=now(), min_ratio=${minRatio}, status=case(isnull(assets_out) OR assets_out=0, "empty", guard=1, "blocked_low_count", true(), "ok"), _key=run_time . "_" . substr(md5(tostring(random())), 1, 8)`
				+ ` | fields - guard | inputlookup append=true assetdb_runs | sort 0 -run_time | head ${keep} | outputlookup assetdb_runs | where 1=0]`);
			section('Only write the asset database when the run passed the safety check');
			command('| where isnull(adb_is_marker) AND isnull(adb_is_prev) AND adb_guard=0');
		}
		if (table.length) { section('Output to KV store'); command(`| table _key, asset, source, source_lookup, last_seen, ${usesScope ? 'scope, ' : ''}${conflictFields.length ? 'conflicts, ' : ''}${table.join(', ')}`); }
		command('| outputlookup override_if_empty=false assetdb');

		return lines;
	}

	return {
		buildSearchLines: buildSearchLines,
		getLookupArray: getLookupArray,
		safeParse: safeParse,
		splQuote: splQuote,
		checkEvalExpression: checkEvalExpression,
		isReservedFieldName: isReservedFieldName,
		parseMaxKeys: parseMaxKeys,
		parseMinRatio: parseMinRatio,
		parseRunsToKeep: parseRunsToKeep,
		DEFAULT_MIN_RATIO: DEFAULT_MIN_RATIO,
		DEFAULT_RUNS_TO_KEEP: DEFAULT_RUNS_TO_KEEP,
		getKeyBlocklist: getKeyBlocklist,
		DEFAULT_KEY_BLOCKLIST: DEFAULT_KEY_BLOCKLIST,
		DEFAULT_MAX_KEY_SHARE: DEFAULT_MAX_KEY_SHARE,
		sourceEnabled: sourceEnabled,
		checkBalancedParens: checkBalancedParens,
		MAX_AGE_RE: MAX_AGE_RE,
		parseMaxValues: parseMaxValues,
		FIELD_NAME_RE: FIELD_NAME_RE,
		NORMALIZERS: NORMALIZERS,
		cimPresetFields: cimPresetFields,
		buildPreviewSearches: buildPreviewSearches,
		buildPreviewDiff: buildPreviewDiff,
		VALIDATION_TYPES: VALIDATION_TYPES,
		VALUE_TYPES: VALUE_TYPES,
		HARD_MAX_KEYS: HARD_MAX_KEYS,
		DEFAULT_MAX_KEYS: DEFAULT_MAX_KEYS,
	};
});
