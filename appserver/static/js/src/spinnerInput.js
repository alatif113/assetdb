define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class SpinnerInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);
			let value = _.escape(data.value);
			let minimum = _.escape(data.minimum);
			let maximum = _.escape(data.maximum);

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
				let current_val = parseInt($text_input.val()) || minimum || maximum || '';
				let target_val = (current_val += 1);
				let value = this._check_range(target_val, minimum, maximum)
				if (value) $text_input.val(value);
				return false;
			});

			$('.increment-down', this.$input).on('click', (e) => {
				let $text_input = $('input', this.$input);
				let current_val = parseInt($text_input.val()) || minimum || maximum || '';
				let target_val = (current_val -= 1);
				let value = this._check_range(target_val, minimum, maximum)
				if (value) $text_input.val(value);
				return false;
			});

			if (data.help) {
				let $help = $(`<div class="help-block">${data.help}</div>`);
				this.$input.append($help);
			}
		}

		_check_range(value, minimum, maximum) {
			if (minimum && maximum) {
				if (value <= maximum && value >= minimum) {
					return value;
				}
			} else if (minimum) {
				if (value >= minimum) {
					return value;
				}
			} else if (maximum) {
				if (value <= maximum) {
					return value;
				}
			} else {
				return value;
			}
			return null;
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
