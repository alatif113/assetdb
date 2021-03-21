//# sourceURL=asset_base.js

require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
	'/static/app/assetdb/js/src/modal.js',
	'/static/app/assetdb/js/src/textInput.js',
	'/static/app/assetdb/js/src/radioInput.js',
	'/static/app/assetdb/js/src/spinnerInput.js',
	'/static/app/assetdb/js/src/multiselectInput.js',
	'/static/app/assetdb/js/src/format.js',
	'splunkjs/mvc/searchmanager',
	'splunkjs/mvc/simpleform/input/dropdown',
	'splunkjs/mvc/simplexml/ready!',
], function (_, $, mvc, SearchManager, Modal, TextInput, RadioInput, SpinnerInput, MultiSelectInput, format, SearchManager, DropdownInput) {
	$el = $('#ab_config');
	const ENDPOINT_BASE = '/servicesNS/nobody/assetdb/configs/';
	const SERVICE = mvc.createService();

	/**
	 * GET request against a Splunk REST API
	 *
	 * @param {String}		endpoint	Splunk REST API endpoint.
	 *
	 * @return {Promise} 				Jquery promise with retrieved configuration data.
	 */
	function getConf(endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.get(path, {}, function (err, results) {});
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
		let deferred = SERVICE.post(path, data, function (err, results) {});
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
		let deferred = SERVICE.del(path, function (err, results) {
			deferred.resolve(results);
		});
		return deferred.promise();
	}

	/**
	 * Create and show the EditAdd modal to add a new field or edit an existing field within the field list.
	 *
	 * @param {Array}	lookupArray		Array of lookup names currently within the asset lookup list.
	 * @param {Array}	fieldArray		Array of field names currently within the asset field list.
	 * @param {Object}	field			Field object to be edited. Empty object if a new field is being added.
	 *
	 */
	function editAddField(lookupArray, fieldArray, field = {}) {
		console.log(fieldArray);
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

		let ignoreValuesInput = new TextInput({
			id: 'inputIgnoreValues',
			label: 'Ignore Values',
			value: field?.content?.ignore_values || '',
			help: '[Optional] A comma separated list of values to ignore',
		});

		let fillnullInput = new TextInput({
			id: 'inputFillnull',
			label: 'Fill Null',
			value: field?.content?.fillnull || '',
			help: '[Optional] Fill null entries with a static value',
		});

		let typeInput = new RadioInput({
			id: 'inputType',
			label: 'Type',
			choices: [
				{ label: 'Single', value: 'single' },
				{ label: 'Multivalue', value: 'multivalue' },
				{ label: 'Eval', value: 'eval' },
			],
			value: field?.content?.type || 'single',
			help: 'Use a single value, keep all unique entries as a multivalue, or use an eval expression to define this field',
		});

		if (parseInt(field?.content?.key_field)) typeInput.disable();

		let mergeMethodInput = new RadioInput({
			id: 'inputMergeMethod',
			label: 'Merge Method',
			choices: [
				{ label: 'Latest', value: 'latest' },
				{ label: 'Coalesce', value: 'coalesce' },
			],
			value: field?.content?.merge_method || 'latest',
			help: 'Either take the most recent value or define a precedence based on the source data',
		});

		let mergeOrderInput = new MultiSelectInput({
			id: 'inputMergeOrder',
			label: 'Merge Order',
			choices: lookupArray.map((lookup) => {
				return { label: lookup, value: lookup };
			}),
			value: field?.content?.merge_order || [],
			help: '[Optional] Define the precedence of the source data; if no precendence is provided, a random order is used',
		});

		let spinnerInput = new SpinnerInput({
			id: 'inputMaxValues',
			label: 'Max Values',
			value: field?.content?.max_values || 10,
			help: 'The maximum number of values to store as a multivalue',
		});

		let evalExpInput = new TextInput({
			id: 'inputEvalExp',
			label: 'Eval Expression',
			value: field?.content?.eval_expression || '',
			help: 'An SPL eval expression, example: replace(field1, "[^w]", "")',
		});

		$form = $(`
            <div class="form-horizontal">
                <div class="input-group-base"></div>
                <div class="input-group-toggle input-group-single"></div>
                <div class="input-group-toggle input-group-multivalue"></div>
                <div class="input-group-toggle input-group-eval"></div>
            </div>`);

		$('.input-group-base', $form)
			.append(fieldNameInput.getInput())
			.append(keyFieldInput.getInput())
			.append(caseSensitiveInput.getInput())
			.append(ignoreValuesInput.getInput())
			.append(fillnullInput.getInput())
			.append(typeInput.getInput());

		$('.input-group-single', $form).append(mergeMethodInput.getInput()).append(mergeOrderInput.getInput());
		$('.input-group-multivalue', $form).append(spinnerInput.getInput());
		$('.input-group-eval', $form).append(evalExpInput.getInput());

		let type = typeInput.getValue();
		$('.input-group-toggle', $form).hide();
		$(`.input-group-${type}`, $form).show();

		let mergeMethod = mergeMethodInput.getValue();
		let $input = mergeOrderInput.getInput();
		mergeMethod == 'latest' ? $input.hide() : $input.show();

		keyFieldInput.getInput().on('change', function (e, data) {
			if (data.value == '1') {
				typeInput.setValue('single');
				typeInput.disable();
			} else {
				typeInput.enable();
			}
		});

		typeInput.getInput().on('change', function (e, data) {
			$('.input-group-toggle', $form).hide();
			$(`.input-group-${data.value}`, $form).show();
		});

		mergeMethodInput.getInput().on('change', function (e, data) {
			let $input = mergeOrderInput.getInput();
			data.value == 'latest' ? $input.hide() : $input.show();
		});

		let editAddModal = new Modal({
			wide: true,
			title: field ? 'Edit Field' : 'Add Field',
			primaryButton: 'Save',
			onRemove: function () {
				mvc.Components.getInstance(mergeOrderInput.getId()).dispose();
			},
			onPrimaryBtnClick: function () {
				if (fieldNameInput.isEditable()) {
					let pattern = /^\w+$/;
					if (!pattern.test(fieldNameInput.getValue())) {
						fieldNameInput.setError('Field name can only use alphanumeric characters and underscores');
						return;
					}
				}

				let endpointAssetdb = 'conf-assetdb/';
				let endpointTransforms = 'conf-transforms/asset_db';
				let endpointSavedSearches = 'conf-savedsearches/assetdb-lookupgen';

				let dataAssetdb = {
					key_field: keyFieldInput.getValue(),
					case_sensitive: caseSensitiveInput.getValue(),
					ignore_values: ignoreValuesInput.getValue(),
					fillnull: fillnullInput.getValue(),
					type: typeInput.getValue(),
					merge_method: mergeMethodInput.getValue(),
					merge_order: mergeOrderInput.getValue(),
					max_values: spinnerInput.getValue() || 2,
					eval_expression: evalExpInput.getValue(),
				};

				let dataTransforms = {
					fields_list: fieldArray.join(','),
				};

				let dataSavedSearch = {
					search: makeMergeSearch(fields),
				};

				if (fieldNameInput.isEditable()) {
					dataAssetdb.name = fieldNameInput.getValue();
				} else {
					endpointAssetdb += fieldNameInput.getValue();
				}

				let promiseAssetdb = setConf(endpointAssetdb, dataAssetdb);
				let promiseTransforms = setConf(endpointTransforms, dataTransforms);

				$.when(promiseAssetdb, promiseTransforms).done(() => {
					buildContent('section-fields');
					this.hide();
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
	function deleteField(fieldArray, name) {
		let deleteModal = new Modal({
			wide: false,
			title: 'Delete Field',
			primaryButton: 'Delete',
			onPrimaryBtnClick: function () {
				let endpointAssetdb = 'conf-assetdb/' + name;
				let endpointTransforms = 'conf-transforms/asset_db';

				const index = fieldArray.indexOf(lookup);
				if (index > -1) fieldArray.splice(index, 1);

				let dataTransforms = {
					fields_list: fieldArray.join(','),
				};

				let promiseAssetdb = delConf(endpointAssetdb);
				let promiseTransforms = setConf(endpointTransforms, dataTransforms);

				$.when(promiseAssetdb, promiseTransforms).done(() => {
					buildContent('section-fields');
					this.hide();
				});
			},
		});

		let $body = $(`<div>Are you sure you want to delete field <i>${name}</i>?</div>`);
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
		$form = $(`
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
				search: '| rest /services/apps/local | search disabled=0 | fields title label',
			},
			{ tokens: true }
		);

		let s = new SearchManager(
			{
				id: 'searchLookup',
				preview: true,
				cache: true,
				search: '| rest /services/data/transforms/lookups | search eai:acl.app=$app$ | table title',
			},
			{ tokens: true }
		);

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
				let value = lookupInput.val();
				if (!value) {
					return;
				} else if (lookupArray.indexOf(value) > -1) {
					$('.input-lookup .splunk-choice-input-message div').text(`The lookup file ${value} has already been added.`);
				} else {
					lookupArray.push(value);
					let endpoint = 'conf-assetdb/general';
					let data = { lookups: lookupArray.join(',') };
					let promise = setConf(endpoint, data);
					$.when(promise).done(() => {
						buildContent('section-lookups');
						this.hide();
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
	 * @param {String}	lookup			Lookup name to be deleted.
	 *
	 */
	function deleteLookup(lookupArray, lookup) {
		const index = lookupArray.indexOf(lookup);
		if (index > -1) lookupArray.splice(index, 1);
		let deleteModal = new Modal({
			wide: false,
			title: 'Remove Lookup',
			primaryButton: 'Remove',
			onPrimaryBtnClick: function () {
				let endpoint = 'conf-assetdb/general';
				let data = { lookups: lookupArray.join(',') };
				let promise = setConf(endpoint, data);
				$.when(promise).done(() => {
					buildContent('section-lookups');
					this.hide();
				});
			},
		});

		let $body = $(
			`<div>Are you sure you want to remove asset lookup <i>${lookup}</i> from the merge process? Note: The lookup will still exist within Splunk.</div>`
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
			let fields = JSON.parse(data).entry;
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
									<th>Type</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</section>
					<section data-section-id="section-search">
						<p><i class="icon-info-circle"></i> Auto generated search that merges all asset lookups according to configured fields and their respective merge settings.</p>
						<a href="#" class="btn btn-primary btn-add-field">Run Search <i class="icon-external"></i></a>
						<div class="query-container">
							<textarea class="raw-query"></textarea>
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

			let general = fields.find((obj) => {
				return obj.name === 'general';
			});
			let lookupArray = general?.content?.lookups.split(',') || [];
			let fieldArray = fields.reduce(function (result, obj) {
				if (obj.name !== 'general') {
					result.push(obj.name);
				}
				return result;
			}, []);
			fieldArray.push('_key');

			$('.btn-add-field', $container).on('click', () => editAddField(lookupArray, fieldArray));
			$('.btn-add-lookup', $container).on('click', () => addLookup(lookupArray));

			lookupArray.forEach(function (lookup) {
				let $tr = $(`
					<tr data-name="${lookup}">
						<td>${lookup}</td>
						<td><a class="adb-lookup-edit" href="#">Edit <i class="icon-external"></i></a> | <a class="adb-lookup-delete" href="#">Delete</a></td>'}
					</tr>
				`);
				$('.adb-lookup-edit', $tr).on('click', () => addLookup(lookupArray));
				$('.adb-lookup-delete', $tr).on('click', () => deleteLookup(lookupArray, lookup));
				$('.lookups-table tbody', $container).append($tr);
			});

			fields.forEach(function (field) {
				if (field.name == 'general') return;

				let isKey = parseInt(field.content.key_field);
				let caseSensitive = parseInt(field.content.case_sensitive);

				let $tr = $(`
					<tr data-name="${field.name}">
						<td class="expands"><a href="#"><i class="icon-triangle-down-small"></i></a></td>
						<td>
							<span>${field.name}</span>${isKey ? '<span class="key-tag">Key</span>' : ''}
							<div class="more-info" style="display: none">
								<dl class="list-dotted">
									<dt>Key Field</dt><dd>${isKey ? 'Yes' : 'No'}</dd>
									<dt>Case Sensitive</dt><dd>${caseSensitive ? 'Yes' : 'No'}</dd>
									<dt>Ignore Values</dt><dd>${field.content.ignore_values || 'N/A'}</dd>
									<dt>Fill Null</dt><dd>${field.content.fillnull || 'N/A'}</dd>
								</dl>
							</div>
						</td>
						<td>${field.content.type}</td>
						<td><a class="adb-field-edit" href="#">Edit</a> | <a class="adb-field-delete" href="#">Delete</a></td>'}
					</tr>`);

				let $dl = $('dl', $tr);
				if (field.content.type == 'single') {
					$dl.append(`<dt>Merge Method</dt><dd>${field.content.merge_method}</dd>`);
					if (field.content.merge_method == 'coalesce') {
						$dl.append(`<dt>Merge Order</dt><dd>${field.content.merge_order}</dd>`);
					}
				} else if (field.content.type == 'multivalue') {
					$dl.append(`<dt>Max Values</dt><dd>${field.content.max_values}</dd>`);
				} else if (field.content.type == 'eval') {
					$dl.append(`<dt>Eval Expression</dt><dd>${field.content.eval_expression}</dd>`);
				}

				$('td.expands', $tr).on('click', function () {
					$(this).next().find('.more-info').toggle();
					$('i', this).toggleClass('icon-triangle-right-small').toggleClass('icon-triangle-down-small');
					return false;
				});

				$('.adb-field-edit', $tr).on('click', () => editAddField(lookupArray, fieldArray, field));
				$('.adb-field-delete', $tr).on('click', () => deleteField(fieldArray, field.name));

				$('.fields-table tbody', $container).append($tr);
			});

			let query = makeMergeSearch(fields);
			let $formatted_query = format(query, true, true);
			$('.raw-query', $container).val(query);
			$('.formatted-query', $container).append($formatted_query);

			$el.append($container);
		});
	}

	/**
	 * Build the Splunk merge search query
	 *
	 * @param {Array}		fieldArray	Array of field stanzas and their key value pairs from the assetdb.conf configuration file.
	 *
	 * @return {String}		Built Splunk query
	 */
	function makeMergeSearch(fieldArray) {
		let fieldSplit = [];
		let coalesce = [];
		let stats = [];
		let evalExp = [];
		let keys = [];
		let table = [];
		let fillnull = [];
		let ignoreValues = [];
		let caseSensitive = [];
		let maxValues = [];
		let lookups = [];

		fieldArray.forEach(function (field) {
			if (field.name == 'general' && field?.content?.lookups) {
				let lookupsArray = field.content.lookups.split(',');
				console.log(lookupsArray);
				lookups = lookupsArray.map((lookup) => {
					return `\n| \`append_adb_lookup(${lookup})\``;
				});
			} else {
				if (parseInt(field.content.key_field)) keys.push(field.name);

				if (field.content.ignore_values) {
					let ignoreValuesArray = field.content.ignore_values.split(',');
					let ignoreValuesMerge = ignoreValuesArray.map((value) => {
						return `"${value}"`;
					});
					ignoreValues.push(`${field.name} = if(in(${field.name}, ${ignoreValuesMerge.join(', ')}), null(), ${field.name})`);
				}

				if (field?.content?.fillnull) {
					fillnull.push(`${field.name} = if(isnull(${field.name}), "${field.content.fillnull}", ${field.name})`);
				}

				if (!parseInt(field.content.case_sensitive)) {
					caseSensitive.push(`${field.name} = lower(${field.name})`);
				}

				if (field.content.type == 'single') {
					if (field.content.merge_method == 'latest') {
						stats.push(`latest(${field.name}) as ${field.name}`);
					} else if (field.content.merge_method == 'coalesce') {
						fieldSplit.push(`{adb_source}_${field.name} = ${field.name}`);

						let mergeOrderArray = field.content.merge_order.split(',');

						let statsMerge = mergeOrderArray.map((lookup) => {
							return `latest(${lookup}_${field.name}) as ${lookup}_${field.name}`;
						});
						stats = stats.concat(statsMerge);

						let postEvalMerge = mergeOrderArray.map((lookup) => {
							return `${lookup}_${field.name}`;
						});
						coalesce.push(`${field.name} = coalesce(${postEvalMerge.join(', ')})`);
					}
				} else if (field.content.type == 'multivalue') {
					stats.push(`values(${field.name}) as ${field.name}`);
					maxValues.push(`${field.name} = mvindex(${field.name},0,${parseInt(field.content.max_values) - 1})`);
				} else if (field.content.type == 'eval') {
					evalExp.push(`${field.name} = ${field.content.eval_expression}`);
				}

				table.push(field.name);
			}
		});

		let search = '| makeresults';
		if (lookups.length) search += lookups.join('');
		if (caseSensitive.length) search += `\n| eval ${caseSensitive.join(', ')}`;
		if (ignoreValues.length) search += `\n| eval ${ignoreValues.join(', ')}`;
		if (fillnull.length) search += `\n| eval ${fillnull.join(', ')}`;
		if (keys.length) search += `\n| eval _key = ${keys.join('.')}`;
		if (fieldSplit.length) search += `\n| eval ${fieldSplit.join(', ')}`;
		if (stats.length) search += `\n| stats ${stats.join(', ')} by _key`;
		if (maxValues.length) search += `\n| eval ${maxValues.join(', ')}`;
		if (coalesce.length) search += `\n| eval ${coalesce.join(', ')}`;
		if (evalExp.length) search += `\n| eval ${evalExp.join(', ')}`;
		search += `\n| table _key, ${table.join(', ')}`;

		return search;
	}

	buildContent();
});
