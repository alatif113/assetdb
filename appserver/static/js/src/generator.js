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
	const MERGE_ORDER_RE = /^[A-Za-z0-9_]+$/;
	const MERGE_METHODS = ['latest', 'min', 'max', 'avg', 'coalesce'];
	const DEFAULT_MAX_KEYS = 25;
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
	const RESERVED_FIELD_NAMES = ['general', 'asset', 'source', 'source_lookup', 'last_seen', '_key', '_time', '_raw', 'host', 'index', 'sourcetype', 'linecount', 'punct', 'splunk_server', 'timestartpos', 'timeendpos'];

	function isReservedFieldName(name) {
		return RESERVED_FIELD_NAMES.includes(String(name).toLowerCase());
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
		let dedupMv = [];
		let evalExp = [];
		let keys = [];
		let table = [];
		let fillnull = [];
		let validation = [];
		let ignoreValues = [];
		let caseInsensitive = [];
		let maxValues = [];

		const lookupsArray = getLookupArray(fieldArray);
		for (const {lookup, name} of lookupsArray) {
			if (!LOOKUP_FILE_RE.test(lookup)) throw new Error(`Invalid lookup "${lookup}"`);
			if (!SOURCE_NAME_RE.test(name)) throw new Error(`Invalid lookup input name "${name}"`);
		}
		const lookupFiles = lookupsArray.map(({lookup}) => `| \`input_adb_lookup(${lookup})\``);
		const lookupNames = lookupsArray.map(({lookup, name}) => `source_lookup=${splQuote(lookup)}, ${splQuote(name)}`);

		for (const field of fieldArray) {
			const {name, content} = field;
			if (name == 'general') continue;
			if (!FIELD_NAME_RE.test(name)) throw new Error(`Invalid field name "${name}"`);
			if (content.merge_method && !MERGE_METHODS.includes(content.merge_method)) throw new Error(`Invalid merge method "${content.merge_method}" for field ${name}`);

			if (parseInt(content.key_field)) {
				keys.push(name);
			}

			const ignored = content.ignore_values ? safeParse(content.ignore_values, null) : null;
			if (Array.isArray(ignored)) {
				if (ignored.length) {
					const lower = !parseInt(content.case_sensitive);
					const quoted = ignored.map(n => splQuote(lower ? String(n).toLowerCase() : n));
					ignoreValues.push(`${name} = if(in(${name}, ${quoted.join(', ')}), null(), ${name})`);
				}
			}

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

			if (!parseInt(content.case_sensitive)) {
				caseInsensitive.push(name);
			}

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
					// Most recent first: list() keeps arrival order and the rows are sorted by _time (newest first) before each stats.
					recentMv = true;
					stats.push(`list(${name}) as ${name}`);
					statsFinal.push(`list(${name}) as ${name}`);
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
		if (multivalue.length) { section('Split multivalue fields'); command(`| foreach ${multivalue.join(', ')} [eval <<FIELD>>=split(<<FIELD>>, "|")]`); }
		if (caseInsensitive.length) { section('Convert case insensitive fields to lowercase'); command(`| foreach ${caseInsensitive.join(', ')} [eval <<FIELD>>=lower(<<FIELD>>)]`); }
		if (validation.length) { section('Validate field values'); command(`| eval ${validation.join(', ')}`); }
		if (ignoreValues.length) { section('Ignore values'); command(`| eval ${ignoreValues.join(' ')}`); }
		if (lookupNames.length) { section('Map source lookup to source name'); command(`| eval source=case(${lookupNames.join(', ')})`); }
		if (evalExp.length) { section('Eval expression fields'); command(`| eval ${evalExp.join(', ')}`); }
		if (fieldSplit.length) { section('Create lookup specific fields for priority based coalesce'); command(`| eval ${fieldSplit.join(', ')}`); }
		if (keys.length) { section('Shallow merge assets with matching key fields (using basic stats)'); command('| eval _key = ' + (keys.length == 1 ? keys[0] : `mvjoin(mvdedup(mvappend(${keys.join(', ')})), "::")`)); }
		command('| search _key=*');
		// _time is carried through the first stats so that `latest` and the recent-first multivalue order still have a timestamp in the final stats
		if (recentMv) { section('Sort newest first (multivalue fields keep their most recent values)'); command('| sort 0 -_time'); }
		if (stats.length) command(`| stats values(source) as source, values(source_lookup) as source_lookup, max(_time) as last_seen, ${((usesLatest || recentMv) ? ['latest(_time) as _time'] : []).concat(stats).join(', ')} by _key`);
		if (keys.length) { section('Deep merge assets with matching key fields (using custom command)'); command('| eval _key = ' + (keys.length == 1 ? keys[0] : `mvappend(${keys.join(', ')})`)); }
		command(`| adbmerge max_keys=${parseMaxKeys(fieldArray)}`);
		command('| eval _key = md5(mvjoin(mvsort(asset), "::"))');
		if (recentMv) command('| sort 0 -_time');
		if (stats.length) command(`| stats values(asset) as asset, values(source) as source, values(source_lookup) as source_lookup, max(last_seen) as last_seen, ${statsFinal.join(', ')} by _key`);
		if (avgEval.length) { section('Calculate averages'); command(`| eval ${avgEval.join(', ')}`); }
		if (coalesce.length) { section('Define coalesce fields based on lookup priority'); command(`| eval ${coalesce.join(', ')}`); }
		if (fillnull.length) { section('Fill null values (after the merge, only where an asset has no value at all)'); command(`| eval ${fillnull.join(', ')}`); }
		if (dedupMv.length) { section('De-duplicate multivalue fields (order is kept)'); command(`| eval ${dedupMv.map((n) => `${n} = mvdedup(${n})`).join(', ')}`); }
		if (maxValues.length) { section('Trim multivalue fields'); command(`| eval ${maxValues.join(', ')}`); }
		if (table.length) { section('Output to KV store'); command(`| table _key, asset, source, source_lookup, last_seen, ${table.join(', ')}`); }
		command('| outputlookup assetdb');

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
		parseMaxValues: parseMaxValues,
		FIELD_NAME_RE: FIELD_NAME_RE,
		HARD_MAX_KEYS: HARD_MAX_KEYS,
		DEFAULT_MAX_KEYS: DEFAULT_MAX_KEYS,
	};
});
