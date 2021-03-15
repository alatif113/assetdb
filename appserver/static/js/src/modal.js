define(function (require, exports, module) {
	let _ = require('underscore');
	let $ = require('jquery');

	class Modal {
		constructor(data) {
			let title = _.escape(data.title);
			let primaryButton = _.escape(data.primaryButton);

			this.$modal = $(`
                <div class="modal fade ${data.wide ? 'modal-wide' : ''}">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                        <h3>${title}</h3>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <a href="#" data-dismiss="modal" class="btn">Cancel</a>
                        <a href="#" class="btn btn-primary">${primaryButton}</a>
                    </div>
                </div>`);

			if (data.onRemove) this.onRemove = data.onRemove;
			if (data.onPrimaryBtnClick) this.onPrimaryBtnClick = data.onPrimaryBtnClick;

			this.$modal.on('hidden.bs.modal', () => {
				this.$modal.remove();
				this.onRemove();
			});

			$('.btn-primary', this.$modal).on('click', () => {
				this.onPrimaryBtnClick();
			});

			$('body').append(this.$modal);
		}

		//set Modal body with custom jQuery object
		setBody($body) {
			$('.modal-body', this.$modal).append($body);
		}

		//call custom function when Modal is removed
		onRemove() {}

		//set custom function for the primary button
		onPrimaryBtnClick() {}

		show() {
			this.$modal.modal('show');
		}

		hide() {
			this.$modal.modal('hide');
		}
	}

	return Modal;
});
