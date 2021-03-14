"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var SpinnerInput = /*#__PURE__*/function () {
    function SpinnerInput(data) {
      _classCallCheck(this, SpinnerInput);

      var id = _.escape(data.id);

      var label = _.escape(data.label);

      var value = _.escape(data.value);

      this.$input = $("\n                <div id=\"".concat(id, "\" class=\"control-group shared-controls-controlgroup control-group-default\">\n                    <label class=\"control-label\" for=\"control-key\">").concat(label, "</label>\n                    <div role=\"group\" class=\"controls controls-join\">\n                        <div class=\"control shared-controls-spinnercontrol control-default\">\n                            <input type=\"text\" name=\"inputSpinner\" class=\"\" value=\"").concat(value, "\" autocomplete=\"off\" />\n                            <a href=\"#\" class=\"increment-down\">\n                                <i class=\"icon-minus\"></i>\n                            </a>\n                            <a href=\"#\" class=\"increment-up\">\n                                <i class=\"icon-plus\"></i>\n                            </a>\n                        </div>\n                    </div>\n                </div>"));
      $('.increment-up', this.$input).click(function () {
        var $text_input = $('input', this.$input);
        var current_val = parseInt($text_input.val()) || 2;
        var target_val = current_val += 1;
        $text_input.val(target_val);
        return false;
      });
      $('.increment-down', this.$input).click(function () {
        var $text_input = $('input', this.$input);
        var current_val = parseInt($text_input.val()) || 2;
        var target_val = Math.max(2, current_val -= 1);
        $text_input.val(target_val);
        return false;
      });

      if (data.help) {
        var $help = $("<div class=\"help-block\">".concat(data.help, "</div>"));
        this.$input.append($help);
      }
    }

    _createClass(SpinnerInput, [{
      key: "getValue",
      value: function getValue() {
        return $('input', this.$input).val();
      }
    }, {
      key: "getInput",
      value: function getInput() {
        return this.$input;
      }
    }]);

    return SpinnerInput;
  }();

  return SpinnerInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9zcGlubmVySW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIlNwaW5uZXJJbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwidmFsdWUiLCIkaW5wdXQiLCJjbGljayIsIiR0ZXh0X2lucHV0IiwiY3VycmVudF92YWwiLCJwYXJzZUludCIsInZhbCIsInRhcmdldF92YWwiLCJNYXRoIiwibWF4IiwiaGVscCIsIiRoZWxwIiwiYXBwZW5kIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBQSxNQUFNLENBQUMsVUFBU0MsT0FBVCxFQUFrQkMsT0FBbEIsRUFBMkJDLE1BQTNCLEVBQW1DO0FBQ3RDLE1BQUlDLENBQUMsR0FBR0gsT0FBTyxDQUFDLFlBQUQsQ0FBZjs7QUFDQSxNQUFJSSxDQUFDLEdBQUdKLE9BQU8sQ0FBQyxRQUFELENBQWY7O0FBRnNDLE1BSWhDSyxZQUpnQztBQU1sQywwQkFBWUMsSUFBWixFQUFrQjtBQUFBOztBQUNkLFVBQUlDLEVBQUUsR0FBR0osQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0MsRUFBZCxDQUFUOztBQUNBLFVBQUlFLEtBQUssR0FBR04sQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0csS0FBZCxDQUFaOztBQUNBLFVBQUlDLEtBQUssR0FBR1AsQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0ksS0FBZCxDQUFaOztBQUVBLFdBQUtDLE1BQUwsR0FBY1AsQ0FBQyx1Q0FDQUcsRUFEQSxvS0FFMENFLEtBRjFDLDRSQUswREMsS0FMMUQsMmJBQWY7QUFpQkFOLE1BQUFBLENBQUMsQ0FBQyxlQUFELEVBQWtCLEtBQUtPLE1BQXZCLENBQUQsQ0FBZ0NDLEtBQWhDLENBQXNDLFlBQVc7QUFDN0MsWUFBSUMsV0FBVyxHQUFHVCxDQUFDLENBQUMsT0FBRCxFQUFVLEtBQUtPLE1BQWYsQ0FBbkI7QUFDQSxZQUFJRyxXQUFXLEdBQUdDLFFBQVEsQ0FBQ0YsV0FBVyxDQUFDRyxHQUFaLEVBQUQsQ0FBUixJQUErQixDQUFqRDtBQUNBLFlBQUlDLFVBQVUsR0FBR0gsV0FBVyxJQUFJLENBQWhDO0FBQ0FELFFBQUFBLFdBQVcsQ0FBQ0csR0FBWixDQUFnQkMsVUFBaEI7QUFDQSxlQUFPLEtBQVA7QUFDSCxPQU5EO0FBUUFiLE1BQUFBLENBQUMsQ0FBQyxpQkFBRCxFQUFvQixLQUFLTyxNQUF6QixDQUFELENBQWtDQyxLQUFsQyxDQUF3QyxZQUFXO0FBQy9DLFlBQUlDLFdBQVcsR0FBR1QsQ0FBQyxDQUFDLE9BQUQsRUFBVSxLQUFLTyxNQUFmLENBQW5CO0FBQ0EsWUFBSUcsV0FBVyxHQUFHQyxRQUFRLENBQUNGLFdBQVcsQ0FBQ0csR0FBWixFQUFELENBQVIsSUFBK0IsQ0FBakQ7QUFDQSxZQUFJQyxVQUFVLEdBQUdDLElBQUksQ0FBQ0MsR0FBTCxDQUFTLENBQVQsRUFBWUwsV0FBVyxJQUFJLENBQTNCLENBQWpCO0FBQ0FELFFBQUFBLFdBQVcsQ0FBQ0csR0FBWixDQUFnQkMsVUFBaEI7QUFDQSxlQUFPLEtBQVA7QUFDSCxPQU5EOztBQVFBLFVBQUlYLElBQUksQ0FBQ2MsSUFBVCxFQUFlO0FBQ1gsWUFBSUMsS0FBSyxHQUFHakIsQ0FBQyxxQ0FBNEJFLElBQUksQ0FBQ2MsSUFBakMsWUFBYjtBQUNBLGFBQUtULE1BQUwsQ0FBWVcsTUFBWixDQUFtQkQsS0FBbkI7QUFDSDtBQUNKOztBQWhEaUM7QUFBQTtBQUFBLGFBa0RsQyxvQkFBVztBQUNQLGVBQU9qQixDQUFDLENBQUMsT0FBRCxFQUFVLEtBQUtPLE1BQWYsQ0FBRCxDQUF3QkssR0FBeEIsRUFBUDtBQUNIO0FBcERpQztBQUFBO0FBQUEsYUFzRGxDLG9CQUFXO0FBQ1AsZUFBTyxLQUFLTCxNQUFaO0FBQ0g7QUF4RGlDOztBQUFBO0FBQUE7O0FBMkR0QyxTQUFPTixZQUFQO0FBQ0gsQ0E1REssQ0FBTiIsInNvdXJjZXNDb250ZW50IjpbImRlZmluZShmdW5jdGlvbihyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcbiAgICBsZXQgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcbiAgICBsZXQgJCA9IHJlcXVpcmUoJ2pxdWVyeScpO1xuXG4gICAgY2xhc3MgU3Bpbm5lcklucHV0IHtcblxuICAgICAgICBjb25zdHJ1Y3RvcihkYXRhKSB7XG4gICAgICAgICAgICBsZXQgaWQgPSBfLmVzY2FwZShkYXRhLmlkKTtcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IF8uZXNjYXBlKGRhdGEubGFiZWwpO1xuICAgICAgICAgICAgbGV0IHZhbHVlID0gXy5lc2NhcGUoZGF0YS52YWx1ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJGlucHV0ID0gJChgXG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cIiR7aWR9XCIgY2xhc3M9XCJjb250cm9sLWdyb3VwIHNoYXJlZC1jb250cm9scy1jb250cm9sZ3JvdXAgY29udHJvbC1ncm91cC1kZWZhdWx0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbnRyb2wtbGFiZWxcIiBmb3I9XCJjb250cm9sLWtleVwiPiR7bGFiZWx9PC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiByb2xlPVwiZ3JvdXBcIiBjbGFzcz1cImNvbnRyb2xzIGNvbnRyb2xzLWpvaW5cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250cm9sIHNoYXJlZC1jb250cm9scy1zcGlubmVyY29udHJvbCBjb250cm9sLWRlZmF1bHRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBuYW1lPVwiaW5wdXRTcGlubmVyXCIgY2xhc3M9XCJcIiB2YWx1ZT1cIiR7dmFsdWV9XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwiaW5jcmVtZW50LWRvd25cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGkgY2xhc3M9XCJpY29uLW1pbnVzXCI+PC9pPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwiaW5jcmVtZW50LXVwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpIGNsYXNzPVwiaWNvbi1wbHVzXCI+PC9pPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAkKCcuaW5jcmVtZW50LXVwJywgdGhpcy4kaW5wdXQpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGxldCAkdGV4dF9pbnB1dCA9ICQoJ2lucHV0JywgdGhpcy4kaW5wdXQpO1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50X3ZhbCA9IHBhcnNlSW50KCR0ZXh0X2lucHV0LnZhbCgpKSB8fCAyO1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRfdmFsID0gY3VycmVudF92YWwgKz0gMTtcbiAgICAgICAgICAgICAgICAkdGV4dF9pbnB1dC52YWwodGFyZ2V0X3ZhbCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQoJy5pbmNyZW1lbnQtZG93bicsIHRoaXMuJGlucHV0KS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBsZXQgJHRleHRfaW5wdXQgPSAkKCdpbnB1dCcsIHRoaXMuJGlucHV0KTtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudF92YWwgPSBwYXJzZUludCgkdGV4dF9pbnB1dC52YWwoKSkgfHwgMjtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0X3ZhbCA9IE1hdGgubWF4KDIsIGN1cnJlbnRfdmFsIC09IDEpO1xuICAgICAgICAgICAgICAgICR0ZXh0X2lucHV0LnZhbCh0YXJnZXRfdmFsKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuaGVscCkge1xuICAgICAgICAgICAgICAgIGxldCAkaGVscCA9ICQoYDxkaXYgY2xhc3M9XCJoZWxwLWJsb2NrXCI+JHtkYXRhLmhlbHB9PC9kaXY+YCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kaW5wdXQuYXBwZW5kKCRoZWxwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdldFZhbHVlKCkge1xuICAgICAgICAgICAgcmV0dXJuICQoJ2lucHV0JywgdGhpcy4kaW5wdXQpLnZhbCgpXG4gICAgICAgIH1cblxuICAgICAgICBnZXRJbnB1dCgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpbnB1dDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBTcGlubmVySW5wdXQ7XG59KTsiXX0=