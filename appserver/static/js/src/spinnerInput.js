define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class SpinnerInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);
			let value = _.escape(data.value);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control shared-controls-spinnercontrol control-default">
                            <input type="text" name="inputSpinner" class="" value="${value}" autocomplete="off" />
                            <a href="#" class="increment-down">
                                <i class="icon-minus"></i>
                            </a>
                            <a href="#" class="increment-up">
                                <i class="icon-plus"></i>
                            </a>
                        </div>
                    </div>
                </div>`);

			$('.increment-up', this.$input).on('click', (e) => {
				let $text_input = $('input', this.$input);
				let current_val = parseInt($text_input.val()) || 2;
				let target_val = (current_val += 1);
				$text_input.val(target_val);
				return false;
			});

			$('.increment-down', this.$input).on('click', (e) => {
				let $text_input = $('input', this.$input);
				let current_val = parseInt($text_input.val()) || 2;
				let target_val = Math.max(2, (current_val -= 1));
				$text_input.val(target_val);
				return false;
			});

			if (data.help) {
				let $help = $(`<div class="help-block">${data.help}</div>`);
				this.$input.append($help);
			}
		}

		getValue() {
			return parseInt($('input', this.$input).val());
		}

		getInput() {
			return this.$input;
		}
	}

	return SpinnerInput;
});
