require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
	'../app/assetdb/js/modal.min',
	'../app/assetdb/js/textInput.min',
	'../app/assetdb/js/radioInput.min',
	'../app/assetdb/js/spinnerInput.min',
	'../app/assetdb/js/multiselectInput.min',
	'../app/assetdb/js/format.min',
	'splunkjs/mvc/simpleform/input/dropdown',
	'splunkjs/mvc/utils',
	'splunkjs/mvc/simplexml/ready!',
], function (_, $, mvc, SearchManager, Modal, TextInput, RadioInput, SpinnerInput, MultiSelectInput, format, DropdownInput, MvcUtils) {
	const $el = $('#ab_config');
	const ENDPOINT_BASE = '/servicesNS/nobody/assetdb/configs/';
	const VALIDATION_ENDPOINT = '/services/search/v2/parser';
	const SERVICE = mvc.createService();

	/**
	 * Splunk Web URL for a path such as /app/assetdb/search, with the root endpoint and locale prefix.
	 */
	function makeUrl(path) {
		const root = (typeof window !== 'undefined' && window.$C && window.$C.MRSPARKLE_ROOT_PATH) || '';
		const locale = MvcUtils.getPageInfo().locale;
		return `${root}/${locale}${path}`;
	}
	
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
	const SOURCE_NAME_RE = /^[A-Za-z0-9_.\-]+$/;
	const LOOKUP_FILE_RE = /^[A-Za-z0-9_.\-]+$/;
	const MERGE_ORDER_RE = /^[A-Za-z0-9_]+$/;
	const MERGE_METHODS = ['latest', 'min', 'max', 'avg', 'coalesce'];
	const DEFAULT_MAX_KEYS = 25;

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
	const RESERVED_FIELD_NAMES = ['general', 'asset', 'source', 'source_lookup', '_key', '_time', '_raw', 'host', 'index', 'sourcetype', 'linecount', 'punct', 'splunk_server', 'timestartpos', 'timeendpos'];

	function isReservedFieldName(name) {
		return RESERVED_FIELD_NAMES.includes(String(name).toLowerCase());
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
	 * max_keys for adbmerge from the [general] stanza of assetdb.conf: a positive integer, default 25.
	 */
	function parseMaxKeys(fieldArray) {
		const general = fieldArray.find((obj) => obj.name === 'general');
		const n = parseInt(general?.content?.max_keys);
		return isNaN(n) || n < 1 ? DEFAULT_MAX_KEYS : n;
	}

	/**
	 * Number of values to keep for a multivalue field: a positive integer, default 10.
	 */
	function parseMaxValues(value) {
		const n = parseInt(value);
		return isNaN(n) ? 10 : Math.max(1, n);
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
	 * Validate Splunk Query
	 *
	 * @param {String}		query 	Splunk query to validate.
	 *
	 * @return {Promise} 			Jquery promise with retrieved validation data.
	*/
	function validateQuery(query) {
		let deferred = SERVICE.get(VALIDATION_ENDPOINT, {q: query});
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
	 * @param {String}	lookupName		Lookup name to add or delete
	 * @param {String}	lookupFile		Lookup file or definition (add only)
	 * @param {String}	operation		add or delete
	 *
	 * @return {Promise} 				Jquery promise
	 */
	function updateLookups(lookupName, lookupFile, operation) {
		const endpoint = 'conf-assetdb/general/';

		return $.when(getConf('conf-assetdb')).then((data) => {
			const lookupArray = getLookupArray(safeParse(data, {}).entry || []);

			if (operation == 'add') {
				let low = 0
				let high = lookupArray.length;

				while (low < high) {
					let mid = (low + high) >>> 1;
					if (lookupArray[mid].name < lookupName) low = mid + 1;
					else high = mid;
				}

				lookupArray.splice(low, 0, {name: lookupName, lookup: lookupFile});
			} else if (operation == 'delete') {
				let index = lookupArray.findIndex(item => item.name === lookupName);
				if (index > -1) lookupArray.splice(index, 1);
			} else {
				return $.Deferred().reject({message: `unknown operation ${operation}`}).promise();
			}

			return setConf(endpoint, { lookups: JSON.stringify(lookupArray) });
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

			let fields_list = { fields_list: fieldNames.join(',') };
			promises.push(setConf(endpoint_transforms, fields_list));
		}

		return $.when(...promises);
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
			value: field?.content?.case_sensitive || 0,
			help: 'If No, field values are converted to lowercase',
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
			help: '[Optional] Select from a list of common values to ignore or input your own',
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
				{ label: 'Min', value: 'min' },
				{ label: 'Max', value: 'max' },
				{ label: 'Avg', value: 'avg' },
				{ label: 'Coalesce', value: 'coalesce' },
			],
			value: field?.content?.merge_method || 'latest',
			help: 'Use the most recent value, minimum value, maximum value, average value, or define a precedence based on the source data',
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

		let $form = $(`
            <div class="form-horizontal">
                <div class="input-group-base"></div>
                <div class="input-group-toggle input-group-single"></div>
                <div class="input-group-toggle input-group-multivalue"></div>
            </div>`);

		$('.input-group-base', $form)
			.append(fieldNameInput.getInput())
			.append(keyFieldInput.getInput())
			.append(caseSensitiveInput.getInput())
			.append(ignoreValuesInput.getInput())
			.append(fillnullInput.getInput())
			.append(validationInput.getInput())
			.append(evalExpInput.getInput())
			.append(fieldTypeInput.getInput());

		$('.input-group-single', $form).append(mergeMethodInput.getInput()).append(mergeOrderInput.getInput());
		$('.input-group-multivalue', $form).append(spinnerInput.getInput());

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
			},
			onPrimaryBtnClick: function () {
				let error = false;
				let eval_promise = undefined;

				if (fieldTypeInput.getValue() == 'eval' && evalExpInput.getValue()) {
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
						max_values: spinnerInput.getValue() || 2,
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

		let addModal = new Modal({
			wide: false,
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
					finishChange(updateLookups(lookupName, lookupFile, 'add'), 'section-lookups', this);
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
				finishChange(updateLookups(lookupName, null, 'delete'), 'section-lookups', this);
			},
		});

		let $body = $(
			`<div>Are you sure you want to remove asset lookup <i>${_.escape(lookupName)}</i> from the merge process? The lookup will still exist within Splunk.</div>`
		);
		deleteModal.setBody($body);
		deleteModal.show();
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
					</ul>
					<section data-section-id="section-lookups">
						<p><i class="icon-info-circle"></i> Select lookup tables with asset data from individual sources to include within the merge process.</p>
						<a href="#" class="btn btn-primary btn-add-lookup">Add Lookup</a>
						<table class="lookups-table table table-striped table-chrome table-row-expanding table-hover">
							<thead>
								<tr>
									<th>Name</th>
									<th>Lookup</th>
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

			$('.btn-add-field', $container).on('click', () => editAddField(fieldArray));
			$('.btn-add-lookup', $container).on('click', () => addLookup(lookupArray));

			lookupArray.forEach(function (lookup) {
				let $tr = $(`
					<tr data-name="${_.escape(lookup.name)}">
						<td>${_.escape(lookup.name)}</td>
						<td>${_.escape(lookup.lookup)}</td>
						<td><a class="adb-lookup-delete" href="#">Delete</a></td>
					</tr>
				`);
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
									<dt>Ignore Values</dt><dd>${_.escape(formatIgnoreValues(field.content?.ignore_values))}</dd>
									<dt>Fill Null</dt><dd>${_.escape(field.content?.fillnull || 'N/A')}</dd>
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
					$dl.append(`<dt>Max Values</dt><dd>${_.escape(field.content.max_values)}</dd>`);
				} else if (field.content.field_type == 'eval') {
					$dl.append(`<dt>Eval Expression</dt><dd>${_.escape(field.content.eval_expression)}</dd>`);
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

			let promise = makeMergeSearch(fieldArray);
			$.when(promise).done((data) => {
				let $formatted_query = format(data);
				$('.formatted-query', $container).append($formatted_query);
			});
			$el.append($container);
		});
	}

	/**
	 * Build the Splunk merge search query
	 *
	 * @return {String}		Built Splunk query
	 */
	function makeMergeSearch(fieldArray = []) {
		const promise = fieldArray.length ? undefined : getConf('conf-assetdb');

		return $.when(promise).then((data) => {
			if (!fieldArray.length) fieldArray = safeParse(data, {}).entry || [];
			
			let fieldSplit = [];
			let coalesce = [];
			let multivalue = [];
			let stats = [];
			let statsFinal = [];
			let avgEval = [];
			let usesLatest = false;
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
					stats.push(`values(${name}) as ${name}`);
					statsFinal.push(`values(${name}) as ${name}`);
					maxValues.push(`${name} = mvindex(${name},0,${parseMaxValues(content.max_values) - 1})`);
				}
				table.push(name);
			};
			
			let search = '';
			if (lookupFiles.length) search += lookupFiles.join('\n');
			if (multivalue.length) search += '\n```### Split multivalue fields ###```' + `\n| foreach ${multivalue.join(', ')} [eval <<FIELD>>=split(<<FIELD>>, "|")]`;
			if (caseInsensitive.length) search += '\n```### Convert case insensitive fields to lowercase ###```' + `\n| foreach ${caseInsensitive.join(', ')} [eval <<FIELD>>=lower(<<FIELD>>)]`;
			if (validation.length) search += '\n```### Validate field values ###```' + `\n| eval ${validation.join(', ')}`;
			if (ignoreValues.length) search += '\n```### Ignore values ###```' + `\n| eval ${ignoreValues.join(' ')}`;
			if (lookupNames.length) search += '\n```### Map source lookup to source name ###```' + `\n| eval source=case(${lookupNames.join(', ')})`
			if (fillnull.length) search += '\n```### Fill null values ###```' + `\n| eval ${fillnull.join(', ')}`;
			if (evalExp.length) search += '\n```### Eval expression fields ###```' + `\n| eval ${evalExp.join(', ')}`;
			if (fieldSplit.length) search += '\n```### Create lookup specific fields for priority based coalesce ###```' + `\n| eval ${fieldSplit.join(', ')}`;
			if (keys.length) search += '\n```### Shallow merge assets with matching key fields (using basic stats) ###```' + '\n| eval _key = ' + (keys.length == 1 ? keys[0] : `mvjoin(mvdedup(mvappend(${keys.join(', ')})), "::")`);
			search += `\n| search _key=*`;
			// _time is carried through the first stats so that `latest` still has a timestamp in the final stats
			if (stats.length) search += `\n| stats values(source) as source, values(source_lookup) as source_lookup, ${(usesLatest ? ['latest(_time) as _time'] : []).concat(stats).join(', ')} by _key`;
			if (keys.length) search += '\n```### Deep merge assets with matching key fields (using custom command) ###```' + '\n| eval _key = ' + (keys.length == 1 ? keys[0] : `mvappend(${keys.join(', ')})`);
			search += `\n| adbmerge max_keys=${parseMaxKeys(fieldArray)}`
			search += `\n| eval _key = md5(mvjoin(mvsort(asset), "::"))`;
			if (stats.length) search += `\n| stats values(asset) as asset, values(source) as source, values(source_lookup) as source_lookup, ${statsFinal.join(', ')} by _key`;
			if (avgEval.length) search += '\n```### Calculate averages ###```' + `\n| eval ${avgEval.join(', ')}`;
			if (maxValues.length) search += '\n```### Trim multivalue fields ###```' + `\n| eval ${maxValues.join(', ')}`;
			if (coalesce.length) search += '\n```### Define coalesce fields based on lookup priority ###```' + `\n| eval ${coalesce.join(', ')}`;
			if (table.length) search += '\n```### Output to KV store ###```' + `\n| table _key, asset, source, source_lookup, ${table.join(', ')}`;
			search += '\n| outputlookup assetdb';

			return search;
		});
	}

	buildContent();
});
