"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var Modal = /*#__PURE__*/function () {
    function Modal(data) {
      var _this = this;

      _classCallCheck(this, Modal);

      var title = _.escape(data.title);

      var primaryButton = _.escape(data.primaryButton);

      this.$modal = $("\n                <div class=\"modal fade ".concat(data.wide ? 'modal-wide' : '', "\">\n                    <div class=\"modal-header\">\n                        <button type=\"button\" class=\"close\" data-dismiss=\"modal\" aria-hidden=\"true\">&times;</button>\n                        <h3>").concat(title, "</h3>\n                    </div>\n                    <div class=\"modal-body\"></div>\n                    <div class=\"modal-footer\">\n                        <a href=\"#\" data-dismiss=\"modal\" class=\"btn\">Cancel</a>\n                        <a href=\"#\" class=\"btn btn-primary\">").concat(primaryButton, "</a>\n                    </div>\n                </div>"));
      if (data.onRemove) this.onRemove = data.onRemove;
      if (data.onPrimaryBtnClick) this.onPrimaryBtnClick = data.onPrimaryBtnClick;
      this.$modal.on('hidden.bs.modal', function () {
        _this.$modal.remove();

        _this.onRemove();
      });
      $('.btn-primary', this.$modal).on('click', function () {
        _this.onPrimaryBtnClick();
      });
      $('body').append(this.$modal);
    } //set Modal body with custom jQuery object


    _createClass(Modal, [{
      key: "setBody",
      value: function setBody($body) {
        $('.modal-body', this.$modal).append($body);
      } //call custom function when Modal is removed

    }, {
      key: "onRemove",
      value: function onRemove() {} //set custom function for the primary button

    }, {
      key: "onPrimaryBtnClick",
      value: function onPrimaryBtnClick() {}
    }, {
      key: "show",
      value: function show() {
        this.$modal.modal('show');
      }
    }, {
      key: "hide",
      value: function hide() {
        this.$modal.modal('hide');
      }
    }]);

    return Modal;
  }();

  return Modal;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2RhbC5qcyJdLCJuYW1lcyI6WyJkZWZpbmUiLCJyZXF1aXJlIiwiZXhwb3J0cyIsIm1vZHVsZSIsIl8iLCIkIiwiTW9kYWwiLCJkYXRhIiwidGl0bGUiLCJlc2NhcGUiLCJwcmltYXJ5QnV0dG9uIiwiJG1vZGFsIiwid2lkZSIsIm9uUmVtb3ZlIiwib25QcmltYXJ5QnRuQ2xpY2siLCJvbiIsInJlbW92ZSIsImFwcGVuZCIsIiRib2R5IiwibW9kYWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUFBLE1BQU0sQ0FBQyxVQUFVQyxPQUFWLEVBQW1CQyxPQUFuQixFQUE0QkMsTUFBNUIsRUFBb0M7QUFDMUMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFGMEMsTUFJcENLLEtBSm9DO0FBS3pDLG1CQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQUE7O0FBQ2pCLFVBQUlDLEtBQUssR0FBR0osQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0MsS0FBZCxDQUFaOztBQUNBLFVBQUlFLGFBQWEsR0FBR04sQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0csYUFBZCxDQUFwQjs7QUFFQSxXQUFLQyxNQUFMLEdBQWNOLENBQUMscURBQ3VCRSxJQUFJLENBQUNLLElBQUwsR0FBWSxZQUFaLEdBQTJCLEVBRGxELDhOQUlZSixLQUpaLCtTQVM0Q0UsYUFUNUMsOERBQWY7QUFhQSxVQUFJSCxJQUFJLENBQUNNLFFBQVQsRUFBbUIsS0FBS0EsUUFBTCxHQUFnQk4sSUFBSSxDQUFDTSxRQUFyQjtBQUNuQixVQUFJTixJQUFJLENBQUNPLGlCQUFULEVBQTRCLEtBQUtBLGlCQUFMLEdBQXlCUCxJQUFJLENBQUNPLGlCQUE5QjtBQUU1QixXQUFLSCxNQUFMLENBQVlJLEVBQVosQ0FBZSxpQkFBZixFQUFrQyxZQUFNO0FBQ3ZDLFFBQUEsS0FBSSxDQUFDSixNQUFMLENBQVlLLE1BQVo7O0FBQ0EsUUFBQSxLQUFJLENBQUNILFFBQUw7QUFDQSxPQUhEO0FBS0FSLE1BQUFBLENBQUMsQ0FBQyxjQUFELEVBQWlCLEtBQUtNLE1BQXRCLENBQUQsQ0FBK0JJLEVBQS9CLENBQWtDLE9BQWxDLEVBQTJDLFlBQU07QUFDaEQsUUFBQSxLQUFJLENBQUNELGlCQUFMO0FBQ0EsT0FGRDtBQUlBVCxNQUFBQSxDQUFDLENBQUMsTUFBRCxDQUFELENBQVVZLE1BQVYsQ0FBaUIsS0FBS04sTUFBdEI7QUFDQSxLQW5Dd0MsQ0FxQ3pDOzs7QUFyQ3lDO0FBQUE7QUFBQSxhQXNDekMsaUJBQVFPLEtBQVIsRUFBZTtBQUNkYixRQUFBQSxDQUFDLENBQUMsYUFBRCxFQUFnQixLQUFLTSxNQUFyQixDQUFELENBQThCTSxNQUE5QixDQUFxQ0MsS0FBckM7QUFDQSxPQXhDd0MsQ0EwQ3pDOztBQTFDeUM7QUFBQTtBQUFBLGFBMkN6QyxvQkFBVyxDQUFFLENBM0M0QixDQTZDekM7O0FBN0N5QztBQUFBO0FBQUEsYUE4Q3pDLDZCQUFvQixDQUFFO0FBOUNtQjtBQUFBO0FBQUEsYUFnRHpDLGdCQUFPO0FBQ04sYUFBS1AsTUFBTCxDQUFZUSxLQUFaLENBQWtCLE1BQWxCO0FBQ0E7QUFsRHdDO0FBQUE7QUFBQSxhQW9EekMsZ0JBQU87QUFDTixhQUFLUixNQUFMLENBQVlRLEtBQVosQ0FBa0IsTUFBbEI7QUFDQTtBQXREd0M7O0FBQUE7QUFBQTs7QUF5RDFDLFNBQU9iLEtBQVA7QUFDQSxDQTFESyxDQUFOIiwic291cmNlc0NvbnRlbnQiOlsiZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblx0bGV0IF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG5cdGxldCAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cblx0Y2xhc3MgTW9kYWwge1xuXHRcdGNvbnN0cnVjdG9yKGRhdGEpIHtcblx0XHRcdGxldCB0aXRsZSA9IF8uZXNjYXBlKGRhdGEudGl0bGUpO1xuXHRcdFx0bGV0IHByaW1hcnlCdXR0b24gPSBfLmVzY2FwZShkYXRhLnByaW1hcnlCdXR0b24pO1xuXG5cdFx0XHR0aGlzLiRtb2RhbCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbCBmYWRlICR7ZGF0YS53aWRlID8gJ21vZGFsLXdpZGUnIDogJyd9XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2xvc2VcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxoMz4ke3RpdGxlfTwvaDM+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtYm9keVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCIgY2xhc3M9XCJidG5cIj5DYW5jZWw8L2E+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCI+JHtwcmltYXJ5QnV0dG9ufTwvYT5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YCk7XG5cblx0XHRcdGlmIChkYXRhLm9uUmVtb3ZlKSB0aGlzLm9uUmVtb3ZlID0gZGF0YS5vblJlbW92ZTtcblx0XHRcdGlmIChkYXRhLm9uUHJpbWFyeUJ0bkNsaWNrKSB0aGlzLm9uUHJpbWFyeUJ0bkNsaWNrID0gZGF0YS5vblByaW1hcnlCdG5DbGljaztcblxuXHRcdFx0dGhpcy4kbW9kYWwub24oJ2hpZGRlbi5icy5tb2RhbCcsICgpID0+IHtcblx0XHRcdFx0dGhpcy4kbW9kYWwucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMub25SZW1vdmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQkKCcuYnRuLXByaW1hcnknLCB0aGlzLiRtb2RhbCkub24oJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uUHJpbWFyeUJ0bkNsaWNrKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0JCgnYm9keScpLmFwcGVuZCh0aGlzLiRtb2RhbCk7XG5cdFx0fVxuXG5cdFx0Ly9zZXQgTW9kYWwgYm9keSB3aXRoIGN1c3RvbSBqUXVlcnkgb2JqZWN0XG5cdFx0c2V0Qm9keSgkYm9keSkge1xuXHRcdFx0JCgnLm1vZGFsLWJvZHknLCB0aGlzLiRtb2RhbCkuYXBwZW5kKCRib2R5KTtcblx0XHR9XG5cblx0XHQvL2NhbGwgY3VzdG9tIGZ1bmN0aW9uIHdoZW4gTW9kYWwgaXMgcmVtb3ZlZFxuXHRcdG9uUmVtb3ZlKCkge31cblxuXHRcdC8vc2V0IGN1c3RvbSBmdW5jdGlvbiBmb3IgdGhlIHByaW1hcnkgYnV0dG9uXG5cdFx0b25QcmltYXJ5QnRuQ2xpY2soKSB7fVxuXG5cdFx0c2hvdygpIHtcblx0XHRcdHRoaXMuJG1vZGFsLm1vZGFsKCdzaG93Jyk7XG5cdFx0fVxuXG5cdFx0aGlkZSgpIHtcblx0XHRcdHRoaXMuJG1vZGFsLm1vZGFsKCdoaWRlJyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIE1vZGFsO1xufSk7XG4iXX0=