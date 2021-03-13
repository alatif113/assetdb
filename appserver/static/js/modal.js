    
require([
	'underscore',
	'jquery',
], function(_, $) {
    class Modal {
        constructor(data) {
            this.$modal = $(_.escape`
                <div class="modal hide fade ${(data.wide) ? 'modal-wide' : ''}">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                        <h3>${data.title || ''}</h3>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <a href="#" data-dismiss="modal" class="btn">Cancel</a>
                        <a href="#" class="btn btn-primary">${data.primaryButton}</a>
                    </div>
                </div>`
            );

            if (data.onRemove) this.onRemove = data.onRemove;
            if (data.onPrimaryBtnClick) this.onPrimaryBtnClick = data.onPrimaryBtnClick;

            this.$modal.on('hidden.bs.modal', function () {
                this.$modal.remove();
                this.onRemove();
            });

            $('.btn-primary', this.$modal).click(function() {
                this.onPrimaryBtnClick();
            })

            $('body').append($modal);
        }

        //set Modal body with custom jQuery object
        setBody($body) { 
            $('.modal-body', this.$modal).append(setBody());
        }

        //call custom function when Modal is removed
        onRemove() { 
        }

        //set custom function for the primary button
        onPrimaryBtnClick() {
        }

        show() {
            this.$modal.show();
        }
    }

    return Modal;
});