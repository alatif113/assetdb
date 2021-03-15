define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class TextInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="${id}">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control shared-controls-textcontrol control-default">
                            ${
								data.editable || data.editable == undefined
									? `<input type="text" name="${id}" aria-label="Input" class="" value="${data.value}" autocomplete="off">`
									: `<span class="uneditable-input" data-role="uneditable-input">${data.value}</span>`
							}
                        </div>
                    </div>
                </div>`);

			this.editable = data.editable;

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

		setError(error) {
			$('.error-block', this.$input).remove();
			let $error = $(`<div class="error-block">${error}</div>`);
			this.$input.append($error);
		}
	}

	return TextInput;
});
