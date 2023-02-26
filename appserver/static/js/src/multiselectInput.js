define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');
	let _MultiSelectInput = require('splunkjs/mvc/simpleform/input/multiselect');

	class MultiSelectInput {
		constructor(data) {
			let id = _.escape(data.id);
			let label = _.escape(data.label);

			this.$input = $(`
                <div id="${id}" class="control-group shared-controls-controlgroup control-group-default">
                    <label class="control-label" for="control-key">${label}</label>
                    <div role="group" class="controls controls-join">
                        <div class="control control-default"></div>
                    </div>
                </div>`);

			this.id = data.id;

			this.splunkInput = new _MultiSelectInput({
				id: data.id,
				el: $('.control', this.$input),
				choices: data.choices,
				value: data.value,
			}).render();

			$('.splunk-multidropdown', this.$input).css('margin', 0);
			$('.splunk-multidropdown > div > div', this.$input).css('width', '100%');
			$('.splunk-choice-input-message', this.$input).remove();

			if (data.help) {
				let $help = $(`<div class="help-block">${data.help}</div>`);
				this.$input.append($help);
			}
		}

		getValue() {
			return this.splunkInput.val().join(',');
		}

		getInput() {
			return this.$input;
		}

		getId() {
			return this.id;
		}
	}

	return MultiSelectInput;
});
