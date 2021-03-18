//# sourceURL=asset_base.js

require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
	'/static/app/assetdb/js/modal.min.js',
	'/static/app/assetdb/js/textInput.min.js',
	'/static/app/assetdb/js/radioInput.min.js',
	'/static/app/assetdb/js/spinnerInput.min.js',
	'/static/app/assetdb/js/multiselectInput.min.js',
	'splunkjs/mvc/simplexml/ready!',
], function (_, $, mvc, SearchManager, Modal, TextInput, RadioInput, SpinnerInput, MultiSelectInput) {
	$el = $('#ab_config');
	const ENDPOINT_BASE = '/servicesNS/nobody/assetdb/configs/';
	const SERVICE = mvc.createService();

	function getConf(endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.get(path, {}, function (err, results) {});
		return deferred.promise();
	}

	function setConf(endpoint, data) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.post(path, data, function (err, results) {});
		return deferred.promise();
	}

	function delConf(endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = SERVICE.del(path, function (err, results) {
			deferred.resolve(results);
		});
		return deferred.promise();
	}

	function editAddField(field = {}) {
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
			choices: [
				{ label: 'test1', value: 'test1' },
				{ label: 'test2', value: 'test2' },
				{ label: 'test3', value: 'test3' },
			],
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

				let endpoint = 'conf-assetdb/';

				let data = {
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

				if (fieldNameInput.isEditable()) {
					data.name = fieldNameInput.getValue();
				} else {
					endpoint += fieldNameInput.getValue();
				}

				let d = setConf(endpoint, data);
				$.when(d).done(() => {
					buildTables();
					this.hide();
				});
			},
		});

		editAddModal.setBody($form);
		editAddModal.show();
	}

	function deleteField(name) {
		let deleteModal = new Modal({
			wide: false,
			title: 'Delete Field',
			primaryButton: 'Delete',
			onPrimaryBtnClick: function () {
				let endpoint = 'conf-assetdb/' + name;
				let d = delConf(endpoint);
				$.when(d).done(() => {
					buildTables();
					this.hide();
				});
			},
		});

		let $body = $(`<div>Are you sure you want to delete field <i>${name}</i>?</div>`);
		deleteModal.setBody($body);
		deleteModal.show();
	}

	function buildTables() {
		$el.html('');

		let d = getConf('conf-assetdb');

		$.when(d).done((data) => {
			let fields = JSON.parse(data).entry;

			let $container = $(`
				<div class="grid-container">
					<div class="grid-col grid-col-1">
						<h2>Asset Lookups <i class="icon-info-circle" data-toggle="tooltip" title="Select lookup tables with asset data from individual sources to include within the merge process."></i></h2>
						<a href="#" class="btn btn-primary btn-add-field">Add Lookup</a>
						<table class="lookups-table table table-striped table-chrome table-row-expanding table-hover">
							<thead>
								<tr>
									<th>Lookup</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</div>
					<div class="grid-col grid-col-2">
						<h2>Asset Fields <i class="icon-info-circle" data-toggle="tooltip" title="Configure asset fields and how they are merged across individual lookups."></i></h2>
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
					</div>
				</div>
			`);

			$('.btn-add-field', $container).on('click', () => editAddField());

			fields.forEach(function (field) {
				console.log(field);
				if (field.name == 'general') {
					if (!field?.content?.lookups) return;

					let lookups = field.content.lookups.split(',');
					lookups.forEach(function (lookup) {
						let $tr = $(`
							<tr data-name="${lookup}">
								<td>${lookup}</td>
								<td><a class="adb-field-delete" href="#">Delete</a></td>'}
							</tr>
						`);
						$('.lookups-table tbody', $container).append($tr);
					});
				} else {
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

					$('.adb-field-edit', $tr).on('click', () => editAddField(field));
					$('.adb-field-delete', $tr).on('click', () => deleteField(field.name));

					$('.fields-table tbody', $container).append($tr);
				}
			});

			$el.append($container);
		});
	}

	function makeMergeSearch() {
		let d = getConf('conf-assetdb');

		$.when(d).done((data) => {
			let fields = JSON.parse(data).entry;
			let fieldSplit = [];
			let coalesce = [];
			let stats = [];
			let evalExp = [];
			let keys = [];
			let table = [];
			let fillnull = {};
			let ignoreValues = [];
			let caseSensitive = [];
			let maxValues = [];
			let lookups = [];

			fields.forEach(function (field) {
				if (field.name == 'general' && field?.content?.lookups) {
					let lookupsArray = field.content.lookups.split(',');
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

					if (field.content.fillnull) {
						let value = field.content.fillnull;
						if (value in fillnull) fillnull[value].push(field.name);
						else fillnull[value] = [field.name];
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
			if (keys.length) search += `\n| eval _key = ${keys.join('.')}`;
			for (k in fillnull) search += `\n| fillnull ${fillnull[k].join(' ')} value="${k}"`;
			if (fieldSplit.length) search += `\n| eval ${fieldSplit.join(', ')}`;
			search += `\n| stats ${stats.join(', ')} by _key`;
			if (maxValues.length) search += `\n| eval ${maxValues.join(', ')}`;
			if (coalesce.length) search += `\n| eval ${coalesce.join(', ')}`;
			if (evalExp.length) search += `\n| eval ${evalExp.join(', ')}`;
			search += `\n| table _key, ${table.join(', ')}`;

			console.log(search);
		});
	}

	buildTables();
	makeMergeSearch();
});
