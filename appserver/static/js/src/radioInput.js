define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class RadioInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control btn-group btn-group-radio shared-controls-syntheticradiocontrol control-default" data-name="inputRadioToggle"></div>
                    </div>
                </div>`);

			data.choices.forEach((choice) => {
				let label = _.escape(choice.label);
				let value = _.escape(choice.value);

				let $button = $(
					`<button type="button" role="button" name="inputRadioToggle" aria-label="${label}" class="btn ${
						choice.value == data.value ? 'active' : ''
					}" data-value="${value}" aria-pressed="false">${label}</button>`
				);
				$('.btn-group-radio', this.$input).append($button);
			});

			$('button', this.$input).on('click', (e) => {
				let currVal = $('button.active', this.$input).attr('data-value');
				let targVal = $(e.target).attr('data-value');
				if (currVal != targVal) {
					$('button.active', this.$input).removeClass('active');
					$(e.target).addClass('active');
					this.$input.trigger('change', { value: $(e.target).attr('data-value') });
				}
			});

			if (data.help) {
				let $help = $(`<div class="help-block">${data.help}</div>`);
				this.$input.append($help);
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
