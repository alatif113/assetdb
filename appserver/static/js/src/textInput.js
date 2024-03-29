define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class TextInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);
			let value = _.escape(data.value);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="${id}">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control shared-controls-textcontrol control-default">
                            ${
								data.editable || data.editable == undefined
									? `<input type="text" name="${id}" aria-label="Input" class="" value="${value}" autocomplete="off">`
									: `<span class="uneditable-input" data-role="uneditable-input">${value}</span>`
							}
                        </div>
                    </div>
                </div>`);

			this.editable = data.editable || data.editable == undefined ? true : false;

			if (data.help) {
				let $help = $(`<div class="help-block">${data.help}</div>`);
				this.$input.append($help);
			}
		}

		getValue() {
			return this.editable ? $('input', this.$input).val() : $('span', this.$input).text();
		}

		getInput() {
			return this.$input;
		}

		isEditable() {
			return this.editable;
		}

		validate(pattern) {
			return pattern.test(this.getValue());
		}

		isEmpty() {
			return this.getValue() == '' || this.getValue() == null;
		}

		setError(error) {
			$('.error-message', this.$input).remove();
			let $error = $(`<div class="error-message help-block">${error}</div>`);
			this.$input.append($error);
		}

		clearError() {
			$('.error-message', this.$input).remove();
		}
	}

	return TextInput;
});
