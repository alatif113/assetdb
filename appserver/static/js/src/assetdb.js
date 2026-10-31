require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
	'../app/assetdb/js/modal.min',
	'../app/assetdb/js/textInput.min',
	'../app/assetdb/js/radioInput.min',
	'../app/assetdb/js/spinnerInput.min',
	'../app/assetdb/js/selectInput.min',
	'../app/assetdb/js/multiselectInput.min',
	'../app/assetdb/js/format.min',
	'../app/assetdb/js/generator.min',
	'splunkjs/mvc/simpleform/input/dropdown',
	'splunkjs/mvc/utils',
	'splunkjs/mvc/simplexml/ready!',
], function (_, $, mvc, SearchManager, Modal, TextInput, RadioInput, SpinnerInput, SelectInput, MultiSelectInput, format, Generator, DropdownInput, MvcUtils) {
	const $el = $('#ab_config');
	const ENDPOINT_BASE = '/servicesNS/nobody/assetdb/configs/';
	const VALIDATION_ENDPOINT = '/services/search/v2/parser';
	const SERVICE = mvc.createService();
	const { safeParse, checkEvalExpression, isReservedFieldName, getLookupArray, FIELD_NAME_RE } = Generator;
	const COLLECTION_ENDPOINT = '/servicesNS/nobody/assetdb/storage/collections/config/assetdb';
	// KV store allows 10 accelerations per collection; one is taken by `asset`.
	const MAX_KEY_ACCELERATIONS = 9;
	const NORMALIZER_CHOICES = [
		{ label: 'None', value: 'none' },
		{ label: 'Trim whitespace', value: 'trim' },
		{ label: 'MAC address (aa:bb:cc:dd:ee:ff)', value: 'mac' },
		{ label: 'IP address (trim, no leading zeros)', value: 'ip' },
		{ label: 'Short host name (host from host.domain)', value: 'hostname' },
		{ label: 'Fully qualified domain name', value: 'fqdn' },
		{ label: 'User name (strip DOMAIN\\ and @domain)', value: 'user' },
		{ label: 'Email address (lowercase)', value: 'email' },
		{ label: 'Operating system family', value: 'os' },
	];
	const VALIDATION_TYPE_CHOICES = [
		{ label: 'None', value: 'none' },
		{ label: 'IP address (v4 or v6)', value: 'ip' },
		{ label: 'IPv4 address', value: 'ipv4' },
		{ label: 'IPv6 address', value: 'ipv6' },
		{ label: 'MAC address', value: 'mac' },
		{ label: 'Email address', value: 'email' },
		{ label: 'Host name', value: 'hostname' },
		{ label: 'Fully qualified domain name', value: 'fqdn' },
		{ label: 'IPv4 CIDR', value: 'cidr' },
		{ label: 'Whole number', value: 'integer' },
		{ label: 'Number', value: 'number' },
	];
	const VALUE_TYPE_CHOICES = [
		{ label: 'Text', value: 'string' },
		{ label: 'Number', value: 'number' },
		{ label: 'True/false', value: 'bool' },
		{ label: 'Time', value: 'time' },
		{ label: 'CIDR', value: 'cidr' },
	];

	/**
	 * Splunk Web URL for a path such as /app/assetdb/search, with the root endpoint and locale prefix.
	 */
	function makeUrl(path) {
		const root = (typeof window !== 'undefined' && window.$C && window.$C.MRSPARKLE_ROOT_PATH) || '';
		const locale = MvcUtils.getPageInfo().locale;
		return `${root}/${locale}${path}`;
	}
	
	/**
	 * Display text for the ignore_values conf property (a JSON array stored as a string).
	 */
	function formatIgnoreValues(value) {
		const parsed = safeParse(value, null);
		return Array.isArray(parsed) && parsed.length ? parsed.join(', ') : 'N/A';
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

	/**
	 * Show a modal with an error message (the text is escaped).
	 */
	function showError(message) {
		const errorModal = new Modal({
			wide: false,
			title: 'Error',
			primaryButton: 'Close',
			onPrimaryBtnClick: function () {
				this.hide();
			},
		});
		errorModal.setBody($(`<div class="alert alert-error">${_.escape(message)}</div>`));
		errorModal.show();
	}

	/**
	 * Run the follow-up steps of a change in order: wait for the config writes, regenerate and
	 * save the merge search, then refresh the page and close the modal. Any failure is shown to
	 * the user and the page is reloaded from the server so it never displays unsaved state.
	 *
	 * @param {Promise}	writes		Promise for the config write(s) of this change
	 * @param {String}	section		Section to show after the page is rebuilt
	 * @param {Modal}	modal		Modal to close on success
	 */
	function finishChange(writes, section, modal) {
		$.when(writes)
			.then(() => updateSearch())
			.done(() => {
				buildContent(section);
				modal.hide();
			})
			.fail((err) => {
				showError(`The change could not be saved completely: ${describeError(err)}. The merge search may be out of date.`);
				buildContent(section);
				modal.hide();
			});
	}

	/**
	 * Validate Splunk Query
	 *
	 * @param {String}		query 	Splunk query to validate.
	 *
	 * @return {Promise} 			Jquery promise with retrieved validation data.
	*/
	function validateQuery(query) {
		// the v2 parser endpoint only accepts POST (a GET answers 405); an invalid query comes back as 400 with messages
		let deferred = SERVICE.post(VALIDATION_ENDPOINT, {q: query, output_mode: 'json'});
		return deferred.promise();
	}

	/**
	 * GET request against a Splunk REST API
	 *
	 * @param {String}		endpoint	Splunk REST API endpoint.
	 *
	 * @return {Promise} 				Jquery promise with retrieved configuration data.
	 */
	function getConf(endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.get(path, {count: 0});
		return deferred.promise();
	}

	/**
	 * POST request against a Splunk REST API
	 *
	 * @param {String}		endpoint	Splunk REST API endpoint.
	 *
	 * @return {Promise} 				Jquery promise with set configuration data.
	 */
	function setConf(endpoint, data) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.post(path, data);
		return deferred.promise();
	}

	/**
	 * DELETE request against a Splunk REST API
	 *
	 * @param {String}		endpoint	Splunk REST API endpoint.
	 *
	 * @return {Promise} 				Jquery promise with deleted configuration data.
	 */
	function delConf(endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.del(path);
		return deferred.promise();
	}

	/**
	 * Update the 'lookups' key within the 'general' stanza of assetdb.conf. The current list is
	 * read from the server first so concurrent edits are not overwritten with stale page state.
	 *
	 * @param {Object}	source			Source ({name, lookup, ...options}); only {name} is needed to delete
	 * @param {String}	operation		add, update (replace the options of an existing source) or delete
	 *
	 * @return {Promise} 				Jquery promise
	 */
	function updateLookups(source, operation) {
		const endpoint = 'conf-assetdb/general/';

		return $.when(getConf('conf-assetdb')).then((data) => {
			const lookupArray = getLookupArray(safeParse(data, {}).entry || []);

			if (operation == 'add') {
				let low = 0
				let high = lookupArray.length;

				while (low < high) {
					let mid = (low + high) >>> 1;
					if (lookupArray[mid].name < source.name) low = mid + 1;
					else high = mid;
				}

				lookupArray.splice(low, 0, source);
			} else if (operation == 'update') {
				let index = lookupArray.findIndex(item => item.name === source.name);
				if (index < 0) return $.Deferred().reject({message: `source ${source.name} no longer exists`}).promise();
				lookupArray[index] = Object.assign({}, lookupArray[index], source);
			} else if (operation == 'delete') {
				let index = lookupArray.findIndex(item => item.name === source.name);
				if (index > -1) lookupArray.splice(index, 1);
			} else {
				return $.Deferred().reject({message: `unknown operation ${operation}`}).promise();
			}

			return setConf(endpoint, { lookups: JSON.stringify(lookupArray) });
		});
	}

	/**
	 * Bring the KV collection definition in line with the fields: an index on every key field (the
	 * collection allows 10, `asset` takes one) and a field type for single value fields.
	 *
	 * @return {Promise}	Resolves with the number of changed settings
	 */
	function syncCollection() {
		return $.when(getConf('conf-assetdb')).then((data) => {
			const fields = (safeParse(data, {}).entry || []).filter((e) => e.name !== 'general');
			const desired = {};
			fields
				.filter((f) => parseInt(f.content.key_field))
				.slice(0, MAX_KEY_ACCELERATIONS)
				.forEach((f) => {
					desired[`accelerated_fields.${f.name}`] = JSON.stringify({ [f.name]: 1 });
				});
			fields.forEach((f) => {
				if (f.content.field_type === 'single' && f.content.value_type) desired[`field.${f.name}`] = f.content.value_type;
			});

			return $.when(SERVICE.get(COLLECTION_ENDPOINT, { output_mode: 'json' }).promise()).then((current) => {
				const content = ((safeParse(current, {}).entry || [])[0] || {}).content || {};
				const protectedNames = ['asset', 'source', 'source_lookup', 'last_seen'];
				const changes = {};
				Object.keys(desired).forEach((k) => {
					if (content[k] !== desired[k]) changes[k] = desired[k];
				});
				// settings of fields that no longer qualify (deleted, no longer a key, no longer typed) are cleared
				Object.keys(content).forEach((k) => {
					const m = /^(accelerated_fields|field)\.(.+)$/.exec(k);
					if (m && !protectedNames.includes(m[2]) && content[k] !== '' && !(k in desired)) changes[k] = '';
				});
				if (!Object.keys(changes).length) return 0;
				return $.when(SERVICE.post(COLLECTION_ENDPOINT, changes).promise()).then(() => Object.keys(changes).length);
			});
		});
	}

	/**
	 * Update a field within assetdb.conf
	 *
	 * @param {Array}	fieldArray		Array of field data from assetdb.conf
	 * @param {Object}	fieldData		Field object of field being added or edited. Empty object if field is being deleted
	 * @param {String}	fieldName		Field name of field being added, edited, or deleted
	 * @param {String}	operation		Operation to be performed: add, edit, or delete
	 *
	 * @return {Promise} 				Jquery promise
	 */
	function updateField(fieldArray, fieldData, fieldName, operation) {
		let promises = [];

		if (operation == 'add') {
			// Update assetdb.conf
			let endpoint_assetdb = 'conf-assetdb/';
			fieldData.name = fieldName;
			promises.push(setConf(endpoint_assetdb, fieldData));

			// Update transforms.conf
			let endpoint_transforms = 'conf-transforms/assetdb';
			let fieldNames = fieldArray.reduce(function (result, obj) {
				if (obj.name !== 'general') {
					result.push(obj.name);
				}
				return result;
			}, []);
			let index = fieldNames.indexOf(fieldName);

			if (index == -1) {
				fieldNames.push(fieldName);
			}

			fieldNames.push('_key');
			fieldNames.push('asset');
			fieldNames.push('source');
			fieldNames.push('source_lookup');
			fieldNames.push('last_seen');

			let fields_list = { fields_list: fieldNames.join(',') };
			promises.push(setConf(endpoint_transforms, fields_list));

		} else if (operation == 'edit') {
			// Update assetdb.conf
			let endpoint_assetdb = 'conf-assetdb/' + fieldName;
			promises.push(setConf(endpoint_assetdb, fieldData));

		} else if (operation == 'delete') {
			promises.push(delConf('conf-assetdb/' + fieldName));

			// Update transforms.conf
			let endpoint_transforms = 'conf-transforms/assetdb';
			let fieldNames = fieldArray.reduce(function (result, obj) {
				if (obj.name !== 'general') {
					result.push(obj.name);
				}
				return result;
			}, []);
			let index = fieldNames.indexOf(fieldName);

			if (index > -1) {
				fieldNames.splice(index, 1);
			}

			fieldNames.push('_key');
			fieldNames.push('asset');
			fieldNames.push('source');
			fieldNames.push('source_lookup');
			fieldNames.push('last_seen');

			let fields_list = { fields_list: fieldNames.join(',') };
			promises.push(setConf(endpoint_transforms, fields_list));
		}

		return $.when(...promises).then(() => syncCollection());
	}

	/**
	 * Update the 'assetdb_merge-lookupgen' search within savedsearches.conf
	 * 
	 * @param {Array}	fieldArray		Array of field data from assetdb.conf
	 */
	function updateSearch(fieldArray) {
		let endpoint = 'conf-savedsearches/assetdb-lookupgen';
		let promise = makeMergeSearch(fieldArray);
		return $.when(promise).then((query) => {
			let data = { search: query };
			return setConf(endpoint, data);
		});
	}

	/**
	 * Create and show the EditAdd modal to add a new field or edit an existing field within the field list.
	 *
	 * @param {Array}	fieldArray		Array of field names currently within the asset field list.
	 * @param {Object}	field			Field object to be edited. Empty object if a new field is being added.
	 *
	 */
	function editAddField(fieldArray, field = {}) {
		let lookupArray = getLookupArray(fieldArray);
		const general = (fieldArray.find((e) => e.name === 'general') || {}).content || {};

		let fieldNameInput = new TextInput({
			id: 'inputFieldName',
			label: 'Field Name',
			editable: field?.name ? false : true,
			value: field?.name || '',
		});

		let keyFieldInput = new RadioInput({
			id: 'inputKeyField',
			label: 'Key Field',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field?.content?.key_field || 0,
			help: 'Key fields define a unique asset',
		});

		let caseSensitiveInput = new RadioInput({
			id: 'inputCaseSensitive',
			label: 'Case Sensitive',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field?.content?.case_sensitive ?? general.default_case_sensitive ?? 0,
			help: 'If No, field values are matched case insensitively (lowercased unless Keep Original Case is on)',
		});

		let keepCaseInput = new RadioInput({
			id: 'inputKeepCase',
			label: 'Keep Original Case',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field?.content?.keep_case || 0,
			help: 'Key fields only: store the original value and lowercase it only when matching assets. Values that differ only by case are then kept separately',
		});

		let descriptionInput = new TextInput({
			id: 'inputDescription',
			label: 'Description',
			value: field?.content?.description || '',
			help: '[Optional] What this field means, for the people who use the asset data',
		});

		let normalizerInput = new SelectInput({
			id: 'inputNormalizer',
			label: 'Normalizer',
			choices: [{ label: `Default (${general.default_normalizer || 'none'})`, value: 'default' }].concat(NORMALIZER_CHOICES),
			value: field?.content?.normalizer || 'default',
			help: 'Rewrites every value into a canonical form before matching and merging, so the same asset matches across sources',
		});

		let validationTypeInput = new SelectInput({
			id: 'inputValidationType',
			label: 'Validate As',
			choices: VALIDATION_TYPE_CHOICES,
			value: field?.content?.validation_type || 'none',
			help: 'Values that are not of this type are dropped (checked after normalizing)',
		});

		let valueTypeInput = new SelectInput({
			id: 'inputValueType',
			label: 'Value Type',
			choices: VALUE_TYPE_CHOICES,
			value: field?.content?.value_type || 'string',
			help: 'Single value fields only: the type declared for the field in the KV store collection',
		});

		/*let ignoreValuesInput = new TextInput({
			id: 'inputIgnoreValues',
			label: 'Ignore Values',
			value: field?.content?.ignore_values || '',
			help: '[Optional] A pipe delimited list of values to ignore',
		});*/

		let ignoreValuesInput = new MultiSelectInput({
			id: 'inputIgnoreValues',
			label: 'Ignore Values',
			allowCustomValues: true,
			choices: [{value: "null"}, {value: "unknown"}, {value: ""}],
			value: (field?.content?.ignore_values) ? safeParse(field.content.ignore_values, []) : [],
			help: '[Optional] Values to ignore: type a value, re:<regular expression> or cidr:<network>, e.g. unknown, re:^169\\.254\\., cidr:127.0.0.0/8',
		});

		let inheritIgnoreInput = new RadioInput({
			id: 'inputInheritIgnore',
			label: 'Use Global Ignore List',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field?.content?.inherit_ignore ?? 1,
			help: 'Also ignore the values in the global ignore list (Settings)',
		});

		let allowedSourcesInput = new MultiSelectInput({
			id: 'inputAllowedSources',
			label: 'Allowed Sources',
			choices: lookupArray.map((lookup) => ({ label: lookup.name, value: lookup.name })),
			value: field?.content?.allowed_sources ? field.content.allowed_sources.split(',') : [],
			help: '[Optional] Only take values for this field from these sources (leave empty for all sources)',
		});

		let fillnullInput = new TextInput({
			id: 'inputFillnull',
			label: 'Fill Null',
			value: field?.content?.fillnull || '',
			help: '[Optional] Fill null entries with a static value',
		});

		let validationInput = new TextInput({
			id: 'inputvalidation',
			label: 'Validation',
			value: field?.content?.validation || '',
			help: '[Optional] Use a regular expression to validate field values. Values that do not match are ignored. Case insensitive fields are lowercased before validation',
		});

		let evalExpInput = new TextInput({
			id: 'inputEvalExp',
			label: 'Eval Expression',
			value: field?.content?.eval_expression || '',
			help: '[Optional] An SPL eval expression to manipulate this field prior to merging, example: replace(field1, "[^w]", "")',
		});

		let fieldTypeInput = new RadioInput({
			id: 'inputFieldType',
			label: 'Field Type',
			choices: [
				{ label: 'Single', value: 'single' },
				{ label: 'Multivalue', value: 'multivalue' },
			],
			value: field?.content?.field_type || 'single',
			help: 'Use a single value or keep all unique entries as a multivalue to define this field',
		});

		let mergeMethodInput = new RadioInput({
			id: 'inputMergeMethod',
			label: 'Merge Method',
			choices: [
				{ label: 'Latest', value: 'latest' },
				{ label: 'Earliest', value: 'earliest' },
				{ label: 'Min', value: 'min' },
				{ label: 'Max', value: 'max' },
				{ label: 'Avg', value: 'avg' },
				{ label: 'Sum', value: 'sum' },
				{ label: 'Coalesce', value: 'coalesce' },
			],
			value: field?.content?.merge_method || 'latest',
			help: 'Use the most recent or earliest value (by the _time of the source rows), the minimum, maximum, average or sum (numbers: set Value Type to Number), or define a precedence based on the source data',
		});

		let mergeOrderInput = new MultiSelectInput({
			id: 'inputMergeOrder',
			label: 'Merge Order',
			choices: lookupArray.map((lookup) => {
				return { label: lookup.name, value: lookup.name };
			}),
			value: (field?.content?.merge_order) ? field?.content?.merge_order.split(',') : [],
			help: '[Optional] Define the precedence of the source data; if no precendence is provided, a random order is used',
		});

		let spinnerInput = new SpinnerInput({
			id: 'inputMaxValues',
			label: 'Max Values',
			value: field?.content?.max_values || 10,
			minimum: 2,
			help: 'The maximum number of values to store as a multivalue',
		});

		let mvOrderInput = new RadioInput({
			id: 'inputMvOrder',
			label: 'Value Order',
			choices: [
				{ label: 'Most recent first', value: 'recent' },
				{ label: 'Alphabetical', value: 'alpha' },
			],
			value: field?.content?.mv_order || 'recent',
			help: 'Which values are kept when a field has more than Max Values: the most recent ones (needs a _time column in the source lookups) or the alphabetically first',
		});

		let $form = $(`
            <div class="form-horizontal">
                <h4 class="adb-group-title">Field</h4>
                <div class="input-group-field"></div>
                <h4 class="adb-group-title">Matching and cleaning</h4>
                <div class="input-group-cleaning"></div>
                <h4 class="adb-group-title">Merging</h4>
                <div class="input-group-merging"></div>
                <div class="input-group-toggle input-group-single"></div>
                <div class="input-group-toggle input-group-multivalue"></div>
            </div>`);

		$('.input-group-field', $form)
			.append(fieldNameInput.getInput())
			.append(descriptionInput.getInput())
			.append(keyFieldInput.getInput())
			.append(fieldTypeInput.getInput());

		$('.input-group-cleaning', $form)
			.append(caseSensitiveInput.getInput())
			.append(keepCaseInput.getInput())
			.append(normalizerInput.getInput())
			.append(validationTypeInput.getInput())
			.append(validationInput.getInput())
			.append(ignoreValuesInput.getInput())
			.append(inheritIgnoreInput.getInput())
			.append(allowedSourcesInput.getInput())
			.append(evalExpInput.getInput());

		$('.input-group-merging', $form).append(fillnullInput.getInput());
		$('.input-group-single', $form).append(mergeMethodInput.getInput()).append(mergeOrderInput.getInput()).append(valueTypeInput.getInput());
		$('.input-group-multivalue', $form).append(spinnerInput.getInput()).append(mvOrderInput.getInput());

		// Keep Original Case only applies to case insensitive key fields
		const toggleKeepCase = () => {
			const applies = parseInt(keyFieldInput.getValue()) === 1 && parseInt(caseSensitiveInput.getValue()) === 0;
			applies ? keepCaseInput.getInput().show() : keepCaseInput.getInput().hide();
		};
		toggleKeepCase();
		keyFieldInput.getInput().on('change', toggleKeepCase);
		caseSensitiveInput.getInput().on('change', toggleKeepCase);

		$('.input-group-toggle', $form).hide();
		$(`.input-group-${fieldTypeInput.getValue()}`, $form).show();

		let $input = mergeOrderInput.getInput();
		mergeMethodInput.getValue() == 'coalesce' ? $input.show() : $input.hide();

		fieldTypeInput.getInput().on('change', function (e, data) {
			$('.input-group-toggle', $form).hide();
			$(`.input-group-${data.value}`, $form).show();
		});

		mergeMethodInput.getInput().on('change', function (e, data) {
			let $input = mergeOrderInput.getInput();
			data.value == 'coalesce' ? $input.show() : $input.hide();
		});

		let editAddModal = new Modal({
			wide: true,
			title: field?.name ? 'Edit Field' : 'Add Field',
			primaryButton: 'Save',
			onRemove: function () {
				mvc.Components.getInstance(mergeOrderInput.getId()).dispose();
				mvc.Components.getInstance(ignoreValuesInput.getId()).dispose();
				mvc.Components.getInstance(allowedSourcesInput.getId()).dispose();
			},
			onPrimaryBtnClick: function () {
				let error = false;
				let eval_promise = undefined;

				if (evalExpInput.getValue()) {
					try {
						checkEvalExpression(evalExpInput.getValue());
					} catch (e) {
						evalExpInput.setError(e.message);
						return;
					}
					eval_promise = validateQuery(`| makeresults | eval a=${evalExpInput.getValue()}`);
				}

				$.when(eval_promise).always((data) => {
					if (data?.status == 400) {
						let error_msg = safeParse(data.responseText, {}).messages || [];
						evalExpInput.setError(error_msg.length ? error_msg[0].text : 'Invalid eval expression')
						error = true;
					}					

					if (fieldNameInput.isEditable()) {
						if (!fieldNameInput.validate(FIELD_NAME_RE)) {
							fieldNameInput.setError('Field name must start with a letter or underscore and can only use alphanumeric characters and underscores');
							error = true;
						} else if (isReservedFieldName(fieldNameInput.getValue())) {
							fieldNameInput.setError(`"${fieldNameInput.getValue()}" is a reserved field name, choose another field name`);
							error = true;
						} else {
							fieldNameInput.clearError();
						}
					}
	
					if (!fillnullInput.isEmpty() && parseInt(keyFieldInput.getValue())) {
						fillnullInput.setError('Fill null cannot be used on a key field, it would merge unrelated assets');
						error = true;
					} else if (fillnullInput.isEmpty() || fillnullInput.validate(/^[a-zA-Z0-9-_]+$/)) {
						fillnullInput.clearError();
					} else {
						fillnullInput.setError('Fillnull value can only use alphanumeric characters and underscores');
						error = true;
					}
	
					if (!validationInput.isEmpty()) {
						try {
							new RegExp(validationInput.getValue());
							validationInput.clearError();
						} catch {
							validationInput.setError('Invalid regular expression');
							error = true;
						}
					} else {
						validationInput.clearError();
					}
	
					if (error) return;
	
					let operation = fieldNameInput.isEditable() ? 'add' : 'edit';
					let fieldData = {
						key_field: keyFieldInput.getValue(),
						case_sensitive: caseSensitiveInput.getValue(),
						ignore_values: JSON.stringify(ignoreValuesInput.getValue()),
						fillnull: fillnullInput.getValue(),
						validation: validationInput.getValue(),
						field_type: fieldTypeInput.getValue(),
						merge_method: mergeMethodInput.getValue(),
						merge_order: mergeOrderInput.getValue(),
						inherit_ignore: inheritIgnoreInput.getValue(),
						allowed_sources: allowedSourcesInput.getValue(),
						max_values: spinnerInput.getValue() || 2,
						mv_order: mvOrderInput.getValue(),
						keep_case: parseInt(keyFieldInput.getValue()) === 1 && parseInt(caseSensitiveInput.getValue()) === 0 ? keepCaseInput.getValue() : 0,
						description: descriptionInput.getValue(),
						normalizer: normalizerInput.getValue(),
						validation_type: validationTypeInput.getValue(),
						value_type: fieldTypeInput.getValue() === 'single' ? valueTypeInput.getValue() : 'string',
						eval_expression: evalExpInput.getValue(),
					};
	
					let promise = updateField(fieldArray, fieldData, fieldNameInput.getValue(), operation);
	
					finishChange(promise, 'section-fields', this);
				});
			},
		});

		editAddModal.setBody($form);
		editAddModal.show();
	}

	/**
	 * Create and show the Delete modal to delete an existing field within the field list.
	 *
	 * @param {Array}	fieldArray		Array of field names currently within the asset field list.
	 * @param {String}	field			Field name of the field to be deleted.
	 *
	 */
	function deleteField(fieldArray, fieldName) {
		let deleteModal = new Modal({
			wide: false,
			title: 'Delete Field',
			primaryButton: 'Delete',
			onPrimaryBtnClick: function () {
				let promise = updateField(fieldArray, {}, fieldName, 'delete');

				finishChange(promise, 'section-fields', this);
			},
		});

		let $body = $(`<div>Are you sure you want to delete field <i>${_.escape(fieldName)}</i>?</div>`);
		deleteModal.setBody($body);
		deleteModal.show();
	}

	/**
	 * One line describing the non-default options of a source.
	 */
	function sourceSummary(source) {
		const parts = [];
		if (source.max_age) parts.push(`max age ${source.max_age}`);
		if (source.time_field) parts.push(`time from ${source.time_field}`);
		if (source.filter) parts.push('row filter');
		const mapped = Object.keys(source.columns || {}).length;
		if (mapped) parts.push(`${mapped} column${mapped > 1 ? 's' : ''} mapped`);
		return parts.join(', ') || '-';
	}

	/**
	 * Inputs for the options of one source (enabled, role, column mapping, max age, row filter), shared by the
	 * add and edit modals.
	 *
	 * @param {Object}	source		Current source object, or {} for a new one
	 * @return {Object}				{ $el, collect(): options to store, validate(): Promise resolving to an error message or '' }
	 */
	function buildSourceOptions(source) {
		const enabledInput = new RadioInput({
			id: 'inputSourceEnabled',
			label: 'Enabled',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: Generator.sourceEnabled(source) ? 1 : 0,
			help: 'A disabled source is left out of the merge but keeps its settings',
		});
		const roleInput = new RadioInput({
			id: 'inputSourceRole',
			label: 'Role',
			choices: [
				{ label: 'Authoritative', value: 'authoritative' },
				{ label: 'Enrich only', value: 'enrich' },
			],
			value: source.role || 'authoritative',
			help: 'Authoritative sources create assets and link them. Enrich-only sources (e.g. a vulnerability scanner or firewall log) only add data to an asset they match unambiguously: they never create an asset or link two assets',
		});
		const maxAgeInput = new TextInput({
			id: 'inputSourceMaxAge',
			label: 'Max Age',
			value: source.max_age || '',
			help: '[Optional] Ignore rows older than this, e.g. 30d, 12h or 6mon. Rows without a time are kept',
		});
		const timeFieldInput = new TextInput({
			id: 'inputSourceTimeField',
			label: 'Time Column',
			value: source.time_field || '',
			help: '[Optional] Column holding the epoch time of each row, when the lookup does not use _time',
		});
		const filterInput = new TextInput({
			id: 'inputSourceFilter',
			label: 'Row Filter',
			value: source.filter || '',
			help: '[Optional] Keep only rows where this where expression is true, written against the source columns, e.g. status!="decommissioned"',
		});

		const columnLines = Object.entries(source.columns || {}).map(([field, column]) => `${field} = ${column}`).join('\n');
		const $columns = $(`
			<div class="control-group shared-controls-controlgroup control-group-default">
				<label class="control-label" for="inputSourceColumns">Column Mapping</label>
				<div role="group" class="controls controls-join">
					<div class="control control-default"><textarea id="inputSourceColumns" class="adb-textarea" rows="4" spellcheck="false"></textarea></div>
				</div>
				<div class="help-block">[Optional] One mapping per line, <i>field = source column</i>, when this source names a column differently, e.g. nt_host = Computer Name. Only this source is affected</div>
			</div>`);
		$('textarea', $columns).val(columnLines);

		const $el = $('<div></div>')
			.append(enabledInput.getInput())
			.append(roleInput.getInput())
			.append(maxAgeInput.getInput())
			.append(timeFieldInput.getInput())
			.append(filterInput.getInput())
			.append($columns);

		const parseColumns = () => {
			const columns = {};
			const errors = [];
			($('textarea', $columns).val() || '').split('\n').forEach((line) => {
				if (!line.trim()) return;
				const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
				if (!m) errors.push(`"${line.trim()}" is not "field = column"`);
				else columns[m[1]] = m[2];
			});
			return { columns, errors };
		};

		return {
			$el,
			collect() {
				const { columns } = parseColumns();
				const options = {
					enabled: parseInt(enabledInput.getValue()) ? true : false,
					role: roleInput.getValue(),
					max_age: maxAgeInput.getValue().trim(),
					time_field: timeFieldInput.getValue().trim(),
					filter: filterInput.getValue().trim(),
					columns,
				};
				return options;
			},
			validate() {
				let message = '';
				const maxAge = maxAgeInput.getValue().trim();
				maxAgeInput.clearError();
				filterInput.clearError();
				if (maxAge && !Generator.MAX_AGE_RE.test(maxAge)) {
					maxAgeInput.setError('Use a number and a unit, e.g. 30d, 12h or 6mon');
					message = 'invalid';
				}
				const { columns, errors } = parseColumns();
				$('.error-message', $columns).remove();
				const columnProblems = errors.slice();
				Object.entries(columns).forEach(([field, column]) => {
					if (isReservedFieldName(field) && field !== 'general') columnProblems.push(`"${field}" is a reserved field name`);
					if (/['"\\|`[\]]/.test(column)) columnProblems.push(`column "${column}" has a character that is not allowed`);
				});
				if (columnProblems.length) {
					$columns.append($('<div class="error-message help-block"></div>').text(columnProblems.join('; ')));
					message = 'invalid';
				}
				const filter = filterInput.getValue().trim();
				if (filter) {
					try {
						checkEvalExpression(filter);
						Generator.checkBalancedParens(filter);
					} catch (e) {
						filterInput.setError(e.message);
						return $.Deferred().resolve('invalid').promise();
					}
					return $.when(validateQuery(`| makeresults | where ${filter}`)).then(
						() => message,
						(data) => {
							const messages = (data?.data || safeParse(data?.responseText, {})).messages || [];
							filterInput.setError(messages.length ? messages[0].text : 'Invalid where expression');
							return 'invalid';
						}
					);
				}
				return $.Deferred().resolve(message).promise();
			},
		};
	}

	/**
	 * Show what a lookup holds (row count and columns) so a source can be checked when it is added. It only informs:
	 * a source does not have to fill every column.
	 */
	function showSourceSchema($box, lookup) {
		if (!lookup || !/^[A-Za-z0-9_.-]+$/.test(lookup)) {
			$box.text('');
			return;
		}
		$box.text('Reading the lookup...');
		const oneshot = (search) => $.when(SERVICE.post('/servicesNS/nobody/assetdb/search/jobs', { search, exec_mode: 'oneshot', output_mode: 'json', count: 0 }).promise());
		$.when(oneshot(`| inputlookup ${lookup} | head 200`), oneshot(`| inputlookup ${lookup} | stats count`))
			.done((sample, counted) => {
				const rows = (safeParse(Array.isArray(sample) ? sample[0] : sample, {}).results || []);
				const total = ((safeParse(Array.isArray(counted) ? counted[0] : counted, {}).results || [])[0] || {}).count;
				const columns = [];
				rows.forEach((row) => Object.keys(row).forEach((k) => { if (!k.startsWith('_') && !columns.includes(k)) columns.push(k); }));
				$box.empty().append($('<i class="icon-info-circle"></i>')).append(document.createTextNode(` ${total === undefined ? 'Unknown number of' : total} rows. Columns seen in the first rows: ${columns.length ? columns.join(', ') : '(none)'}. A source does not need to fill every column.`));
			})
			.fail((err) => $box.text(`Could not read the lookup: ${describeError(err)}`));
	}

	/**
	 * Create and show the modal that edits the options of an existing source.
	 */
	function editSource(source) {
		const sourceOptions = buildSourceOptions(source);
		const $form = $('<div class="form-horizontal"></div>')
			.append($('<p></p>').append($('<b></b>').text(source.name)).append(document.createTextNode(` (${source.lookup})`)))
			.append($('<div class="adb-source-schema help-block"></div>'))
			.append(sourceOptions.$el);
		showSourceSchema($('.adb-source-schema', $form), source.lookup);

		const modal = new Modal({
			wide: true,
			title: 'Edit Lookup',
			primaryButton: 'Save',
			onRemove: function () {},
			onPrimaryBtnClick: function () {
				$.when(sourceOptions.validate()).done((problem) => {
					if (problem) return;
					finishChange(updateLookups(Object.assign({ name: source.name }, sourceOptions.collect()), 'update'), 'section-lookups', this);
				});
			},
		});
		modal.setBody($form);
		modal.show();
	}

	/**
	 * Create and show the AddLookup modal to add a new lookup within the asset lookup list.
	 *
	 * @param {Array}	lookupArray		Array of lookup names currently within the asset lookup list.
	 *
	 */
	function addLookup(lookupArray) {
		let $form = $(`
            <div class="form">
				<div class="control-group shared-controls-controlgroup control-group-default">                
					<label class="control-label" for="control-app">App</label>                
					<div role="group" class="controls controls-join ">
						<div class="input-app dropdown-input"></div>
					</div>                                        
				</div>
				<div class="control-group shared-controls-controlgroup control-group-default">                
					<label class="control-label" for="control-lookup">Lookup</label>                
					<div role="group" class="controls controls-join ">
						<div class="input-lookup dropdown-input"></div>
					</div>                                        
				</div>
            </div>`);

		const sourceOptions = buildSourceOptions({});
		$form.append($('<div class="adb-source-schema help-block"></div>')).append(sourceOptions.$el);

		new SearchManager(
			{
				id: 'searchApp',
				preview: true,
				cache: true,
				search: '| rest /services/apps/local | search disabled=0 | fields title label | sort label',
			},
			{ tokens: true }
		);

		new SearchManager(
			{
				id: 'searchLookup',
				preview: true,
				cache: true,
				search:
					'| rest /services/data/lookup-table-files | search eai:acl.app=$app$ | table title | append [| rest /services/data/transforms/lookups | search eai:acl.app=$app$ | table title] | dedup title | sort title',
			},
			{ tokens: true }
		);

		let lookupNameInput = new TextInput({
			id: 'inputLookupName',
			label: 'Name',
		});
		
		lookupNameInput.getInput().prependTo($form);

		let appInput = new DropdownInput(
			{
				id: 'inputApp',
				searchWhenChanged: true,
				showClearButton: true,
				selectFirstChoice: true,
				labelField: 'label',
				valueField: 'title',
				value: '$app$',
				managerid: 'searchApp',
				el: $('.input-app', $form),
			},
			{ tokens: true }
		).render();

		let lookupInput = new DropdownInput(
			{
				id: 'inputLookup',
				searchWhenChanged: true,
				showClearButton: true,
				selectFirstChoice: false,
				labelField: 'title',
				valueField: 'title',
				managerid: 'searchLookup',
				el: $('.input-lookup', $form),
			},
			{ tokens: true }
		).render();

		lookupInput.on('change', (value) => showSourceSchema($('.adb-source-schema', $form), typeof value === 'string' ? value : lookupInput.val()));

		let addModal = new Modal({
			wide: true,
			title: 'Add Lookup',
			primaryButton: 'Save',
			onRemove: function () {
				mvc.Components.getInstance('inputApp').dispose();
				mvc.Components.getInstance('inputLookup').dispose();
				mvc.Components.getInstance('searchApp').dispose();
				mvc.Components.getInstance('searchLookup').dispose();
			},
			onPrimaryBtnClick: function () {
				let lookupFile = lookupInput.val();
				let lookupName = lookupNameInput.getValue();

				if (!lookupName || lookupName == undefined) {
					lookupNameInput.setError('An input name is required')
					return;
				} else if (!lookupNameInput.validate(/^[a-zA-Z0-9_]+$/)) {
					lookupNameInput.setError('The input name can only contain alphanumeric characters or underscores')
					return;
				} else if (!lookupFile) {
					lookupNameInput.setError('A lookup is required')
					return;
				}
		
				if (lookupArray.findIndex(item => item.name === lookupName) > -1) {
					lookupNameInput.setError(`An input with name ${lookupName} already exists`);
				} else if (lookupArray.findIndex(item => item.lookup === lookupFile) > -1) {
					lookupNameInput.setError(`An input with lookup ${lookupFile} already exists`);
				} else {
					$.when(sourceOptions.validate()).done((problem) => {
						if (problem) return;
						finishChange(updateLookups(Object.assign({ name: lookupName, lookup: lookupFile }, sourceOptions.collect()), 'add'), 'section-lookups', this);
					});
				}
			},
		});

		addModal.setBody($form);
		addModal.show();
	}

	/**
	 * Create and show the DeleteLookup modal to delete an existing lookup within the asset lookup list.
	 *
	 * @param {Array}	lookupArray		Array of lookup names currently within the asset lookup list.
	 * @param {String}	lookupName		Lookup name to be deleted.
	 *
	 */
	function deleteLookup(lookupArray, lookupName) {
		let deleteModal = new Modal({
			wide: false,
			title: 'Remove Lookup',
			primaryButton: 'Remove',
			onPrimaryBtnClick: function () {
				finishChange(updateLookups({ name: lookupName }, 'delete'), 'section-lookups', this);
			},
		});

		let $body = $(
			`<div>Are you sure you want to remove asset lookup <i>${_.escape(lookupName)}</i> from the merge process? The lookup will still exist within Splunk.</div>`
		);
		deleteModal.setBody($body);
		deleteModal.show();
	}

	/**
	 * Valid 5 field cron expression (numbers, ranges, steps, lists, names, asterisk and question mark).
	 */
	const CRON_RE = /^\s*([-\d*/,?A-Za-z]+\s+){4}[-\d*/,?A-Za-z]+\s*$/;

	/**
	 * Render the Settings tab: global values stored in the [general] stanza of assetdb.conf plus the schedule
	 * of the merge saved search. Each save writes the config, then regenerates the merge search.
	 */
	function buildSettings($form, fieldArray) {
		const general = (fieldArray.find((e) => e.name === 'general') || {}).content || {};
		const maxKeysInput = new TextInput({
			id: 'inputMaxKeys',
			label: 'Max Keys',
			value: String(Generator.parseMaxKeys(fieldArray)),
			help: `The largest number of unique keys a merged asset may have (1 to ${Generator.HARD_MAX_KEYS}, a hard limit: the merge command holds every key set in memory). Assets in larger clusters are dropped, usually because of a shared key such as a NAT address.`,
		});
		const scheduleInput = new TextInput({
			id: 'inputSchedule',
			label: 'Schedule (cron)',
			value: '',
			help: 'When the merge search runs, as a cron expression, e.g. 0 0 * * * for daily at midnight',
		});
		const scheduledInput = new RadioInput({
			id: 'inputScheduled',
			label: 'Scheduled',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: 1,
			help: 'Turn off to run the merge manually only',
		});

		const defaultCaseInput = new RadioInput({
			id: 'inputDefaultCase',
			label: 'Case Sensitive (default)',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: parseInt(general.default_case_sensitive) || 0,
			help: 'Used for new fields and for fields that do not set it themselves',
		});
		// the widget registers itself globally, so drop the one from a previous render of this tab
		if (mvc.Components.getInstance('inputGlobalIgnore')) mvc.Components.getInstance('inputGlobalIgnore').dispose();
		if (mvc.Components.getInstance('inputKeyBlocklist')) mvc.Components.getInstance('inputKeyBlocklist').dispose();
		const blocklistValues = Generator.getKeyBlocklist(general);
		const keyBlocklistInput = new MultiSelectInput({
			id: 'inputKeyBlocklist',
			label: 'Key Blocklist',
			allowCustomValues: true,
			choices: Generator.DEFAULT_KEY_BLOCKLIST.map((value) => ({ value })),
			value: blocklistValues,
			help: 'Values that are never used to match assets, in any key field: placeholders, loopback and similar. A value that is blocked here still appears in the asset, it just cannot link two assets. Type a value, re:<regular expression> or cidr:<network>',
		});
		const maxKeyShareInput = new TextInput({
			id: 'inputMaxKeyShare',
			label: 'Max Key Share',
			value: String(general.max_key_share === undefined ? Generator.DEFAULT_MAX_KEY_SHARE : general.max_key_share),
			help: 'A key found in more than this many rows is not used to match assets (0 turns it off). Catches shared keys the blocklist does not know about, such as a NAT address, before they chain unrelated assets together. The keys that were skipped are listed in the adbmerge log',
		});
		const globalIgnoreInput = new MultiSelectInput({
			id: 'inputGlobalIgnore',
			label: 'Ignore Values (global)',
			allowCustomValues: true,
			choices: [{ value: 'null' }, { value: 'unknown' }, { value: 'n/a' }, { value: 'none' }],
			value: general.ignore_values ? safeParse(general.ignore_values, []) : [],
			help: 'Ignored in every field that uses the global list. Type a value, re:<regular expression> or cidr:<network>',
		});
		const defaultNormalizerInput = new SelectInput({
			id: 'inputDefaultNormalizer',
			label: 'Normalizer (default)',
			choices: NORMALIZER_CHOICES,
			value: general.default_normalizer || 'none',
			help: 'Applied to fields whose Normalizer is Default',
		});

		$form
			.append(maxKeysInput.getInput())
			.append(defaultCaseInput.getInput())
			.append(defaultNormalizerInput.getInput())
			.append(globalIgnoreInput.getInput())
			.append(keyBlocklistInput.getInput())
			.append(maxKeyShareInput.getInput())
			.append(scheduledInput.getInput())
			.append(scheduleInput.getInput());
		const $save = $('<a href="#" class="btn btn-primary btn-save-settings">Save Settings</a>');
		$form.append($('<div class="control-group"></div>').append($('<div class="controls"></div>').append($save)));

		// the current schedule lives on the saved search
		$.when(getConf('conf-savedsearches/assetdb-lookupgen')).done((data) => {
			const entry = (safeParse(data, {}).entry || [])[0];
			if (!entry) return;
			$('input', scheduleInput.getInput()).val(entry.content.cron_schedule || '');
			$('button', scheduledInput.getInput()).removeClass('active').filter(`[data-value="${parseInt(entry.content.enableSched) ? 1 : 0}"]`).addClass('active');
		});

		$save.on('click', () => {
			let invalid = false;
			const maxKeys = parseInt(maxKeysInput.getValue());
			if (!/^\d+$/.test(String(maxKeysInput.getValue()).trim()) || maxKeys < 1 || maxKeys > Generator.HARD_MAX_KEYS) {
				maxKeysInput.setError(`Enter a whole number from 1 to ${Generator.HARD_MAX_KEYS}`);
				invalid = true;
			} else maxKeysInput.clearError();
			if (!/^\d+$/.test(String(maxKeyShareInput.getValue()).trim()) || parseInt(maxKeyShareInput.getValue()) > 1000000) {
				maxKeyShareInput.setError('Enter a whole number from 0 to 1000000');
				invalid = true;
			} else maxKeyShareInput.clearError();
			if (!CRON_RE.test(scheduleInput.getValue())) {
				scheduleInput.setError('Enter a cron expression with 5 fields, e.g. 0 0 * * *');
				invalid = true;
			} else scheduleInput.clearError();
			if (invalid) return false;

			const writes = $.when(
				setConf('conf-assetdb/general/', {
					max_keys: String(maxKeys),
					default_case_sensitive: String(parseInt(defaultCaseInput.getValue()) ? 1 : 0),
					default_normalizer: defaultNormalizerInput.getValue(),
					ignore_values: JSON.stringify(globalIgnoreInput.getValue()),
					key_blocklist: JSON.stringify(keyBlocklistInput.getValue()),
					max_key_share: String(parseInt(maxKeyShareInput.getValue())),
				}),
				setConf('conf-savedsearches/assetdb-lookupgen', {
					cron_schedule: scheduleInput.getValue().trim(),
					enableSched: String(parseInt(scheduledInput.getValue()) ? 1 : 0),
				})
			);
			finishChange(writes, 'section-settings', { hide() {} });
			return false;
		});
	}

	/**
	 * Build the HTML content of the page
	 *
	 * @param {String}	activeSection	Class name of the section that should be active once HTML is built.
	 *
	 */
	function buildContent(activeSection = 'section-lookups') {
		$el.html('');

		let promise = getConf('conf-assetdb');

		$.when(promise).done((data) => {
			let fieldArray = safeParse(data, {}).entry || [];
			let lookupArray = getLookupArray(fieldArray);

			let $container = $(`
				<div class="container">
					<ul class="nav nav-tabs main-tabs shared-tabcontrols-tabbar">
						<li class="shared-tabcontrols-tabbase" data-section-id="section-lookups">
							<a href="#" class="tab-label">Asset Lookups</a>
						</li>
						<li class="shared-tabcontrols-tabbase" data-section-id="section-fields">            
							<a href="#" class="tab-label">Asset Fields</a>        
						</li>
						<li class="shared-tabcontrols-tabbase" data-section-id="section-search">            
							<a href="#" class="tab-label">Asset Merge Search</a>        
						</li>
						<li class="shared-tabcontrols-tabbase" data-section-id="section-settings">
							<a href="#" class="tab-label">Settings</a>
						</li>
					</ul>
					<section data-section-id="section-lookups">
						<p><i class="icon-info-circle"></i> Select lookup tables with asset data from individual sources to include within the merge process.</p>
						<a href="#" class="btn btn-primary btn-add-lookup">Add Lookup</a>
						<table class="lookups-table table table-striped table-chrome table-row-expanding table-hover">
							<thead>
								<tr>
									<th>Name</th>
									<th>Lookup</th>
									<th>Role</th>
									<th>Options</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</section>
					<section data-section-id="section-fields">
						<p><i class="icon-info-circle"></i> Configure asset fields and how they are merged across individual lookups.</p>
						<a href="#" class="btn btn-primary btn-add-field">Add Field</a>
						<table class="fields-table table table-striped table-chrome table-row-expanding table-hover">
							<thead>
								<tr>
									<th data-key="" class="col-info"><i class="icon-info"></i></th>
									<th>Field</th>
									<th>Field Type</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</section>
					<section data-section-id="section-search">
						<p><i class="icon-info-circle"></i> Auto generated search that merges all asset lookups according to configured fields and their respective merge settings.</p>
						<a target="_blank" href="${makeUrl('/app/assetdb/search')}?s=%2FservicesNS%2Fnobody%2Fassetdb%2Fsaved%2Fsearches%2Fassetdb-lookupgen" class="btn btn-primary">Run Search <i class="icon-external"></i></a>
						<a target="_blank" href="${makeUrl('/manager/assetdb/saved/searches')}?app=assetdb&search=assetdb-lookupgen" class="btn btn-edit-schedule">Edit Schedule <i class="icon-external"></i></a>
						<div class="query-container">
							<div class="formatted-query"></div>
						</div>
					</section>
					<section data-section-id="section-settings">
						<p><i class="icon-info-circle"></i> Global settings for the merge. Changes regenerate the merge search.</p>
						<div class="settings-form form-horizontal"></div>
					</section>
				</div>
			`);

			$(`li[data-section-id="${activeSection}"]`, $container).addClass('active');
			$(`section[data-section-id="${activeSection}"]`, $container).addClass('active');

			$('li', $container).on('click', function () {
				$('li', $container).removeClass('active');
				$(this).addClass('active');
				$('section', $container).removeClass('active');
				let section_id = $(this).attr('data-section-id');
				$(`section[data-section-id="${section_id}"]`, $container).addClass('active');
			});

			if (!lookupArray.length) {
				let error =
					'<p class="error-message"><i class="icon-warning"></i> WARNING: You must add at least one lookup to merge into the asset database!</p>';
				$('section[data-section-id="section-lookups"] p', $container).last().after(error);
				$('section[data-section-id="section-search"] p', $container).last().after(error);
			}

			if (fieldArray.length < 2) {
				let error =
					'<p class="error-message"><i class="icon-warning"></i> WARNING: You must add at least one field to include in the asset database!</p>';
				$('section[data-section-id="section-fields"] p', $container).last().after(error);
				$('section[data-section-id="section-search"] p', $container).last().after(error);
			}

			buildSettings($('.settings-form', $container), fieldArray);

			$('.btn-add-field', $container).on('click', () => editAddField(fieldArray));
			$('.btn-add-lookup', $container).on('click', () => addLookup(lookupArray));

			lookupArray.forEach(function (lookup) {
				let $tr = $(`
					<tr data-name="${_.escape(lookup.name)}">
						<td>${_.escape(lookup.name)}</td>
						<td>${_.escape(lookup.lookup)}</td>
						<td>${lookup.role === 'enrich' ? 'Enrich only' : 'Authoritative'}${Generator.sourceEnabled(lookup) ? '' : ' <span class="key-tag">Disabled</span>'}</td>
						<td>${_.escape(sourceSummary(lookup))}</td>
						<td><a class="adb-lookup-edit" href="#">Edit</a> | <a class="adb-lookup-delete" href="#">Delete</a></td>
					</tr>
				`);
				$('.adb-lookup-edit', $tr).on('click', () => editSource(lookup));
				$('.adb-lookup-delete', $tr).on('click', () => deleteLookup(lookupArray, lookup.name));
				$('.lookups-table tbody', $container).append($tr);
			});

			fieldArray.forEach(function (field) {
				if (field.name == 'general') return;

				let isKey = parseInt(field.content?.key_field);
				let caseSensitive = parseInt(field.content?.case_sensitive);

				let $tr = $(`
					<tr data-name="${_.escape(field.name)}">
						<td class="expands"><a href="#"><i class="icon-triangle-down-small"></i></a></td>
						<td>
							<span>${_.escape(field.name)}</span>${isKey ? '<span class="key-tag">Key</span>' : ''}
							<div class="more-info" style="display: none">
								<dl class="list-dotted">
									<dt>Key Field</dt><dd>${isKey ? 'Yes' : 'No'}</dd>
									<dt>Case Sensitive</dt><dd>${caseSensitive ? 'Yes' : 'No'}</dd>
									<dt>Ignore Values</dt><dd>${_.escape(formatIgnoreValues(field.content?.ignore_values))}${parseInt(field.content?.inherit_ignore ?? 1) ? ' (+ global list)' : ''}</dd>
									<dt>Allowed Sources</dt><dd>${_.escape(field.content?.allowed_sources || 'all')}</dd>
									<dt>Fill Null</dt><dd>${_.escape(field.content?.fillnull || 'N/A')}</dd>
									<dt>Description</dt><dd>${_.escape(field.content?.description || 'N/A')}</dd>
									<dt>Normalizer</dt><dd>${_.escape(field.content?.normalizer || 'default')}</dd>
									<dt>Validate As</dt><dd>${_.escape(field.content?.validation_type || 'none')}</dd>
									<dt>Validation</dt><dd>${_.escape(field.content?.validation || 'N/A')}</dd>
									<dt>Eval Expression</dt><dd>${_.escape(field.content?.eval_expression || 'N/A')}</dd>
								</dl>
							</div>
						</td>
						<td>${_.escape(field.content?.field_type)}</td>
						<td><a class="adb-field-edit" href="#">Edit</a> | <a class="adb-field-delete" href="#">Delete</a></td>
					</tr>`);

				let $dl = $('dl', $tr);
				if (field.content.field_type == 'single') {
					$dl.append(`<dt>Merge Method</dt><dd>${_.escape(field.content.merge_method)}</dd>`);
					if (field.content.merge_method == 'coalesce') {
						$dl.append(`<dt>Merge Order</dt><dd>${_.escape(field.content.merge_order)}</dd>`);
					}
				} else if (field.content.field_type == 'multivalue') {
					$dl.append(`<dt>Max Values</dt><dd>${_.escape(field.content.max_values)} (${field.content.mv_order === 'alpha' ? 'alphabetical' : 'most recent first'})</dd>`);
				}

				$('td.expands', $tr).on('click', function () {
					$(this).next().find('.more-info').toggle();
					$('i', this).toggleClass('icon-triangle-right-small').toggleClass('icon-triangle-down-small');
					return false;
				});

				$('.adb-field-edit', $tr).on('click', () => editAddField(fieldArray, field));
				$('.adb-field-delete', $tr).on('click', () => deleteField(fieldArray, field.name));

				$('.fields-table tbody', $container).append($tr);
			});

			$.when(makeMergeSearchLines(fieldArray))
				.done((lines) => {
					$('.formatted-query', $container).append(format(lines));
				})
				.fail((err) => {
					$('.formatted-query', $container).append($('<div class="error-message"></div>').text(`The merge search cannot be built: ${describeError(err)}`));
				});
			$el.append($container);
		});
	}

	/**
	 * Build the Splunk merge search query
	 *
	 * @return {Promise}	Resolves to the query text
	 */
	function makeMergeSearch(fieldArray = []) {
		return $.when(makeMergeSearchLines(fieldArray)).then((lines) => lines.map((line) => line.text).join('\n'));
	}

	/**
	 * Build the Splunk merge search as typed lines: {kind: 'comment' | 'command', text}. The page renders
	 * these directly, so no SPL has to be parsed to format or highlight it.
	 *
	 * @return {Promise}	Resolves to the array of lines
	 */
	function makeMergeSearchLines(fieldArray = []) {
		const promise = fieldArray.length ? undefined : getConf('conf-assetdb');

		return $.when(promise).then((data) => {
			if (!fieldArray.length) fieldArray = safeParse(data, {}).entry || [];
			return Generator.buildSearchLines(fieldArray);
		});
	}

	buildContent();
});
