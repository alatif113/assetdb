// A labelled native <select> in the same control-group markup as the other input widgets.
define(function (require) {
	let _ = require('underscore');
	let $ = require('jquery');

	class SelectInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="${id}-select">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control control-default"><select id="${id}-select" class="adb-select"></select></div>
                    </div>
                </div>`);

			let $select = $('select', this.$input);
			(data.choices || []).forEach((choice) => {
				$select.append($('<option></option>').attr('value', choice.value).text(choice.label));
			});
			$select.val(data.value === undefined || data.value === null ? '' : String(data.value));
			if ($select.val() === null && data.choices && data.choices.length) $select.val(String(data.choices[0].value));

			if (data.help) {
				this.$input.append($('<div class="help-block"></div>').text(data.help));
			}
			$select.on('change', () => this.$input.trigger('change', { value: this.getValue() }));
		}

		getValue() {
			return $('select', this.$input).val();
		}

		setValue(value) {
			$('select', this.$input).val(String(value));
		}

		getInput() {
			return this.$input;
		}

		setError(error) {
			$('.error-message', this.$input).remove();
			this.$input.append($('<div class="error-message help-block"></div>').text(error));
		}

		clearError() {
			$('.error-message', this.$input).remove();
		}
	}

	return SelectInput;
});
