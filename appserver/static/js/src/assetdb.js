//# sourceURL=asset_base.js

require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
	'/static/app/assetdb/js/modal.js',
	'/static/app/assetdb/js/textInput.js',
	'/static/app/assetdb/js/radioInput.js',
	'/static/app/assetdb/js/spinnerInput.js',
	'/static/app/assetdb/js/multiselectInput.js',
	'splunkjs/mvc/simplexml/ready!',
], function (_, $, mvc, SearchManager, Modal, TextInput, RadioInput, SpinnerInput, MultiSelectInput) {
	$el = $('#ab_config');
	const ENDPOINT_BASE = '/SERVICEsNS/nobody/assetdb/configs/';
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
			editable: field.name ? false : true,
			value: field.name || '',
		});

		let keyFieldInput = new RadioInput({
			id: 'inputKeyField',
			label: 'Key Field',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field.key_field || 0,
			help: 'Key fields define a unique asset',
		});

		let caseSensitiveInput = new RadioInput({
			id: 'inputCaseSensitive',
			label: 'Case Sensitive',
			choices: [
				{ label: 'Yes', value: 1 },
				{ label: 'No', value: 0 },
			],
			value: field.case_sensitive || 0,
			help: 'If No, field values are converted to lowercase',
		});

		let ignoreValuesInput = new TextInput({
			id: 'inputIgnoreValues',
			label: 'Ignore Values',
			value: field.ignore_values || 'null,unknown,undefined',
			help: '[Optional] A comma separated list of values to ignore',
		});

		let fillnullInput = new TextInput({
			id: 'inputFillnull',
			label: 'Fill Null',
			value: field.fillnull || '',
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
			value: field.type || 'single',
			help:
				'Use a single value, keep all unique entries as a multivalue, or use an eval expression to define this field',
		});

		let mergeMethodInput = new RadioInput({
			id: 'inputMergeMethod',
			label: 'Merge Method',
			choices: [
				{ label: 'Latest', value: 'latest' },
				{ label: 'Coalesce', value: 'coalesce' },
			],
			value: field.merge_method || 'latest',
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
			value: field.merge_order || [],
			help:
				'[Optional] Define the precedence of the source data; if no precendence is provided, a random order is used',
		});

		let spinnerInput = new SpinnerInput({
			id: 'inputMaxValues',
			label: 'Max Values',
			value: field.max_values || 10,
			help: 'The maximum number of values to store as a multivalue',
		});

		let evalExpInput = new TextInput({
			id: 'inputEvalExp',
			label: 'Eval Expression',
			value: field.eval_expression || '',
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
					max_values: spinnerInput.getValue(),
					eval_expression: evalExpInput.getValue(),
				};

				if (fieldNameInput.isEditable()) {
					data.name = fieldNameInput.getValue();
				} else {
					endpoint += fieldNameInput.getValue();
				}

				setConf(endpoint, data);
				this.hide();
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
				delConf(endpoint);
				this.hide();
			},
		});

		let $body = $(`<div>Are you sure you want to delete field ${name}?</div>`);
		deleteModal.setBody($body);
		deleteModal.show();
	}

	$button = $('<button class="button">Click Me!</button>');
	$button.appendTo($el);

	$button.click(function () {
		editAddField();
	});
});
