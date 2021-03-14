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
    }]);

    return Modal;
  }();

  return Modal;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2RhbC5qcyJdLCJuYW1lcyI6WyJkZWZpbmUiLCJyZXF1aXJlIiwiZXhwb3J0cyIsIm1vZHVsZSIsIl8iLCIkIiwiTW9kYWwiLCJkYXRhIiwidGl0bGUiLCJlc2NhcGUiLCJwcmltYXJ5QnV0dG9uIiwiJG1vZGFsIiwid2lkZSIsIm9uUmVtb3ZlIiwib25QcmltYXJ5QnRuQ2xpY2siLCJvbiIsInJlbW92ZSIsImFwcGVuZCIsIiRib2R5IiwibW9kYWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQ0FBLE1BQU0sQ0FBQyxVQUFTQyxPQUFULEVBQWtCQyxPQUFsQixFQUEyQkMsTUFBM0IsRUFBbUM7QUFDdEMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFGc0MsTUFJaENLLEtBSmdDO0FBS2xDLG1CQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQUE7O0FBQ2QsVUFBSUMsS0FBSyxHQUFHSixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDQyxLQUFkLENBQVo7O0FBQ0EsVUFBSUUsYUFBYSxHQUFHTixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDRyxhQUFkLENBQXBCOztBQUVBLFdBQUtDLE1BQUwsR0FBY04sQ0FBQyxxREFDZUUsSUFBSSxDQUFDSyxJQUFOLEdBQWMsWUFBZCxHQUE2QixFQUQzQyw4TkFJR0osS0FKSCwrU0FTbUNFLGFBVG5DLDhEQUFmO0FBY0EsVUFBSUgsSUFBSSxDQUFDTSxRQUFULEVBQW1CLEtBQUtBLFFBQUwsR0FBZ0JOLElBQUksQ0FBQ00sUUFBckI7QUFDbkIsVUFBSU4sSUFBSSxDQUFDTyxpQkFBVCxFQUE0QixLQUFLQSxpQkFBTCxHQUF5QlAsSUFBSSxDQUFDTyxpQkFBOUI7QUFFNUIsV0FBS0gsTUFBTCxDQUFZSSxFQUFaLENBQWUsaUJBQWYsRUFBa0MsWUFBTTtBQUNwQyxRQUFBLEtBQUksQ0FBQ0osTUFBTCxDQUFZSyxNQUFaOztBQUNBLFFBQUEsS0FBSSxDQUFDSCxRQUFMO0FBQ0gsT0FIRDtBQUtBUixNQUFBQSxDQUFDLENBQUMsY0FBRCxFQUFpQixLQUFLTSxNQUF0QixDQUFELENBQStCSSxFQUEvQixDQUFrQyxPQUFsQyxFQUEyQyxZQUFNO0FBQzdDLFFBQUEsS0FBSSxDQUFDRCxpQkFBTDtBQUNILE9BRkQ7QUFJQVQsTUFBQUEsQ0FBQyxDQUFDLE1BQUQsQ0FBRCxDQUFVWSxNQUFWLENBQWlCLEtBQUtOLE1BQXRCO0FBQ0gsS0FwQ2lDLENBc0NsQzs7O0FBdENrQztBQUFBO0FBQUEsYUF1Q2xDLGlCQUFRTyxLQUFSLEVBQWU7QUFDWGIsUUFBQUEsQ0FBQyxDQUFDLGFBQUQsRUFBZ0IsS0FBS00sTUFBckIsQ0FBRCxDQUE4Qk0sTUFBOUIsQ0FBcUNDLEtBQXJDO0FBQ0gsT0F6Q2lDLENBMkNsQzs7QUEzQ2tDO0FBQUE7QUFBQSxhQTRDbEMsb0JBQVcsQ0FDVixDQTdDaUMsQ0ErQ2xDOztBQS9Da0M7QUFBQTtBQUFBLGFBZ0RsQyw2QkFBb0IsQ0FDbkI7QUFqRGlDO0FBQUE7QUFBQSxhQW1EbEMsZ0JBQU87QUFDSCxhQUFLUCxNQUFMLENBQVlRLEtBQVosQ0FBa0IsTUFBbEI7QUFDSDtBQXJEaUM7O0FBQUE7QUFBQTs7QUF3RHRDLFNBQU9iLEtBQVA7QUFDSCxDQXpESyxDQUFOIiwic291cmNlc0NvbnRlbnQiOlsiICAgIFxuZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuICAgIGxldCBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xuICAgIGxldCAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cbiAgICBjbGFzcyBNb2RhbCB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGRhdGEpIHtcbiAgICAgICAgICAgIGxldCB0aXRsZSA9IF8uZXNjYXBlKGRhdGEudGl0bGUpO1xuICAgICAgICAgICAgbGV0IHByaW1hcnlCdXR0b24gPSBfLmVzY2FwZShkYXRhLnByaW1hcnlCdXR0b24pO1xuXG4gICAgICAgICAgICB0aGlzLiRtb2RhbCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbCBmYWRlICR7KGRhdGEud2lkZSkgPyAnbW9kYWwtd2lkZScgOiAnJ31cIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJjbG9zZVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGgzPiR7dGl0bGV9PC9oMz5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1ib2R5XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1mb290ZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIiBjbGFzcz1cImJ0blwiPkNhbmNlbDwvYT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIj4ke3ByaW1hcnlCdXR0b259PC9hPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5vblJlbW92ZSkgdGhpcy5vblJlbW92ZSA9IGRhdGEub25SZW1vdmU7XG4gICAgICAgICAgICBpZiAoZGF0YS5vblByaW1hcnlCdG5DbGljaykgdGhpcy5vblByaW1hcnlCdG5DbGljayA9IGRhdGEub25QcmltYXJ5QnRuQ2xpY2s7XG5cbiAgICAgICAgICAgIHRoaXMuJG1vZGFsLm9uKCdoaWRkZW4uYnMubW9kYWwnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy4kbW9kYWwucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5vblJlbW92ZSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQoJy5idG4tcHJpbWFyeScsIHRoaXMuJG1vZGFsKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblByaW1hcnlCdG5DbGljaygpO1xuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgJCgnYm9keScpLmFwcGVuZCh0aGlzLiRtb2RhbCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3NldCBNb2RhbCBib2R5IHdpdGggY3VzdG9tIGpRdWVyeSBvYmplY3RcbiAgICAgICAgc2V0Qm9keSgkYm9keSkgeyBcbiAgICAgICAgICAgICQoJy5tb2RhbC1ib2R5JywgdGhpcy4kbW9kYWwpLmFwcGVuZCgkYm9keSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2NhbGwgY3VzdG9tIGZ1bmN0aW9uIHdoZW4gTW9kYWwgaXMgcmVtb3ZlZFxuICAgICAgICBvblJlbW92ZSgpIHsgXG4gICAgICAgIH1cblxuICAgICAgICAvL3NldCBjdXN0b20gZnVuY3Rpb24gZm9yIHRoZSBwcmltYXJ5IGJ1dHRvblxuICAgICAgICBvblByaW1hcnlCdG5DbGljaygpIHtcbiAgICAgICAgfVxuXG4gICAgICAgIHNob3coKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RhbC5tb2RhbCgnc2hvdycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIE1vZGFsO1xufSk7Il19