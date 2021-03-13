require([
	'underscore',
	'jquery',
], function(_, $) {
    class RadioInput {

        constructor(data) {
            this.$input = $(_.escape`
                <div id="${data.id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${data.label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control btn-group btn-group-radio shared-controls-syntheticradiocontrol control-default" data-name="inputRadioToggle"></div>
                    </div>
                </div>`
            );

            data.choices.forEach((choice) => {
                let $button = $(_.escape`<button type="button" role="button" name="inputRadioToggle" aria-label="${data.label}" class="btn ${(choice.value == data.value) ? 'active' : ''}" data-value="${choice.value}" aria-pressed="false">${choice.label}</button>`);
                $('.btn-group-radio', $input).append($button);
            })

            $('button', this.$input).click(function() {
                let currVal = $('button.active', this.$input).attr('data-value');
                let targVal = $(this).attr('data-value');
                if (currVal != targVal) {
                    $('button.active', this.$input).removeClass('active');
                    $(this).addClass('active');
                    this.trigger('change', {value: $(this).attr('data-value')});
                }
            })

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

    return RadioInput;
});