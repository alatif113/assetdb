    
require([
	'underscore',
	'jquery',
], function(_, $) {

    class BooleanInput {
        constructor(data) {
            this.$input = $(_.escape`
                <div id="${data.id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${data.label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control btn-group btn-group-radio shared-controls-booleanradiocontrol control-default">
                            <button type="button" role="button" name="inputRadioBoolean" aria-label="${data.trueLabel}" class="btn ${(data.value) ? 'active' : ''}" data-value="1" aria-pressed="false">${data.trueLabel}</button>
                            <button type="button" role="button" name="inputRadioBoolean" aria-label="${data.falseLabel}" class="btn ${(!data.value) ? 'active' : ''}" data-value="0" aria-pressed="true">${data.falseLabel}</button>
                        </div>
                    </div>
                </div>`
            );

            $('button', this.$input).click(function() {
                let currVal = $('button.active', this.$input).attr('data-value');
                let targVal = $(this).attr('data-value');
                if (currVal != targVal) {
                    $('button.active', this.$input).removeClass('active');
                    $(this).addClass('active');
                    this.trigger('change', {value: $(this).attr('data-value')});
                }
            });

            if (data.help) {
                let $help = $(`<div class="help-block">${data.help}</div>`);
                $input.append($help);
            }
        }

        getValue() {
            return $('button.active', this.$input).attr('data-value');
        }

        getInput() {
            return this.$input;
        }
    }

    return BooleanInput;
});