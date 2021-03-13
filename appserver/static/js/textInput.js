require([
	'underscore',
	'jquery',
], function(_, $) {
    class TextInput {

        constructor(data) {
            this.$input = $(_.escape`
                <div id="${data.id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="${data.id}">${data.label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control shared-controls-textcontrol control-default">
                            ${(data.editable) ? `<input type="text" name="${data.id}" aria-label="Input" class="" value="${data.value}" autocomplete="off">` : `<span class="uneditable-input" data-role="uneditable-input">${data.value}</span>`}
                        </div>
                    </div>
                </div>`
            );

            if (data.help) {
                let $help = $(`<div class="help-block">${data.help}</div>`);
                $input.append($help);
            }
        }

        getValue() {
            return (data.editable) ? $('input', this.$input).val() : $('span', this.$input).text();
        }

        getInput() {
            return this.$input;
        }
    }

    return TextInput;
});