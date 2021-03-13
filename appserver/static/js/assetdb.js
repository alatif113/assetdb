//# sourceURL=asset_base.js

require([
	'underscore',
	'jquery',
	'splunkjs/mvc',
	'splunkjs/mvc/searchmanager',
    'apps/assetdb/js/modal',
    'apps/assetdb/js/textInput',
    'apps/assetdb/js/booleanInput',
    'apps/assetdb/js/radioInput',
    'apps/assetdb/js/spinnerInput',
    'apps/assetdb/js/multiselectInput',
	'splunkjs/mvc/simplexml/ready!'
], function(_, $, mvc, SearchManager, Modal, TextInput, BooleanInput, RadioInput, SpinnerInput, MultiSelectInput) {

    $el = $('#ab_config');
    var service = mvc.createService();

    function getConf(service, endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = service.get(path,{},function(err, results) {
			
		});
		return deferred.promise(); 
	}

	function setConf(service, endpoint, data) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = service.post(path,data,function(err, results) {
		});
		return deferred.promise();
	}

	function delConf(service, endpoint) {
		let path = ENDPOINT_BASE + endpoint;
		let deferred = service.del(path,function(err, results) {
			deferred.resolve(results)
		});
		return deferred.promise();
	}

    // Edit/Add a field
    function editAddField(field = {}) {

        // Inputs
        let fieldNameInput = new TextInput({
            id: 'inputFieldName',
            label: 'Field Name',
            editable: (field.name) ? false : true,
            value: field.name || '',
        })

        let keyFieldInput = new BooleanInput({
            id: 'inputKeyField',
            label: 'Key Field',
            true_label: 'Yes',
            false_label: 'No',
            value: field.key_field || 0,
            help: 'Key fields define a unique asset'
        });
        
        let caseSensitiveInput = new BooleanInput({
            id: 'inputCaseSensitive',
            label: 'Case Sensitive',
            true_label: 'Yes',
            false_label: 'No',
            value: field.case_sensitive || 0,
            help: 'If No, field values are converted to lowercase'
        });

        let ignoreValuesInput = new TextInput({
            id: 'inputIgnoreValues',
            label: 'Ignore Values',
            value: field.ignore_values || 'null,unknown,undefined',
            help: '[Optional] A comma separated list of values to ignore'
        });
        
        let fillnullInput = new TextInput({
            id: 'inputFillnull',
            label: 'Fill Null',
            value: field.fill_null || '',
            help: '[Optional] Fill null entries with a static value'
        });
        
        let typeInput = new RadioInput({
            id: 'inputType',
            label: 'Type',
            choices: [
                {label: 'Single', value: 'single'},
                {label: 'Multivalue', value: 'multivalue'},
                {label: 'Eval', value: 'eval'}
            ],
            value: field.type || 'single',
            help: 'Use a single value, keep all unique entries as a multivalue, or use an eval expression to define this field'
        });

        let mergeMethodInput = new RadioInput({
            id: 'inputMergeMethod',
            label: 'Merge Method',
            choices: [
                {label: 'Latest', value: 'latest'},
                {label: 'Coalesce', value: 'coalesce'}
            ],
            value: field.merge_method || 'latest',
            help: 'Either take the most recent value or define a precedence based on the source data'
        });
    
        let mergeOrderInput = new MultiSelectInput({
            id: 'inputMergeOrder',
            label: 'Merge Order',
            choices: [
                {label: 'test1', value: 'test1'},
                {label: 'test2', value: 'test2'},
                {label: 'test3', value: 'test3'}
            ],
            value: field.merge_order || [],
            help: '[Optional] Define the precedence of the source data; if no precendence is provided, a random order is used'
        });

        let spinnerInput = new SpinnerInput({
            id: 'inputMaxValues',
            label: 'Max Values',
            value: field.max_values || 10,
            help: 'The maximum number of values to store as a multivalue'
        });

        let evalExpInput = newTextInput({
            id: 'inputEvalExp',
            label: 'Eval Expression',
            value: field.eval_expression || '',
            help: 'An SPL eval expression, example: replace(field1, "[^\w]", "")'
        });

        // Form
        $form = $(`
            <div class="form-horizontal">
                <div class="input-group-base"></div>
                <div class="input-group-toggle input-group-single"></div>
                <div class="input-group-toggle input-group-multivalue"></div>
                <div class="input-group-toggle input-group-eval"></div>
            </div>`
        );

        $('.input-group-base', $form)
            .append(fieldNameInput.getInput())
            .append(keyFieldInput.getInput())
            .append(caseSensitiveInput.getInput())
            .append(typeInput.getInput())
            .append(ignoreValuesInput.getInput())
            .append(fillnullInput.getInput());

        $('.input-group-single', $form)
            .append(mergeMethodInput.getInput())
            .append(mergeOrderInput.getInput());

        $('.input-group-multivalue', $form)
            .append(spinnerInput.getInput());

        $('.input-group-eval', $form)
            .append(evalExpInput.getInput());


        // Form section visibility
        let type = typeInput.getValue();
        $('.input-group-toggle', $form).hide();
        $(`.input-group-${e.value}`, $form).show();

        let mergeMethod = mergeMethodInput.getValue();
        let $input = mergeOrderInput.getInput(); 
        (mergeMethod == 'latest') ? $input.hide() : $input.show();

        typeInput.on('change', function(e) {
            $('.input-group-toggle', $form).hide();
            $(`.input-group-${e.value}`, $form).show();
        })

        mergeMethodInput.on('change', function(e) {
            let $input = mergeOrderInput.getInput(); 
            (e.value == 'latest') ? $input.hide() : $input.show();
        })

        // Modal
        let editAddModal = new Modal({
            wide: true,
            title: (field) ? 'Edit Field' : 'Add Field',
            primaryButton: 'Save',
            onRemove: () => {
                
            }, 
            onPrimaryBtnClick: () => {
                let endpoint = fieldNameInput.getValue();
                let data = {
                    keyField: keyFieldInput.getValue(),
                }
                setConf(service, endpoint, data)
            }
        });

        // Set form body and show
        editAddModal.setBody($form);
        editAddModal.show();
    }
    
    $button = $('<button class="button">Click Me!</button>')
	$button.appendTo($el);

    $button.click(function() {
        editAddField();
    })
});