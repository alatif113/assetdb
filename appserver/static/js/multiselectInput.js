require([
	'underscore',
	'jquery',
	'splunkjs/mvc/simpleform/input/multiselect',
	'splunkjs/mvc/simplexml/ready!'
], function(_, $, MultiSelectInput) {
    
    class MultiSelectInput {

        constructor(data) {
            this.$input = $(_.escape`
                <div id="${data.id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${data.label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control control-default"></div>
                    </div>
                </div>`
            );

            this.splunkInput = new MultiSelectInput({
                id: data.id,
                el: $('.control', this.$input),
                choices: data.choices,
                value: data.value
            }).render();

            $('.splunk-multidropdown', $input).css('margin', 0);
            $('.splunk-multidropdown > div > div', $input).css('width', '100%');
            $('.splunk-choice-input-message', $input).remove();

            if (data.help) {
                let $help = $(`<div class="help-block">${data.help}</div>`);
                $input.append($help);
            }
        }

        getValue() {
            return this.splunkInput.value();
        }

        getInput() {
            return this.$input;
        }
    }

    return MultiSelectInput;
});