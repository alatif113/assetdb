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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9zcGlubmVySW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIlNwaW5uZXJJbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwidmFsdWUiLCIkaW5wdXQiLCJjbGljayIsIiR0ZXh0X2lucHV0IiwiY3VycmVudF92YWwiLCJwYXJzZUludCIsInZhbCIsInRhcmdldF92YWwiLCJNYXRoIiwibWF4IiwiaGVscCIsIiRoZWxwIiwiYXBwZW5kIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBQSxNQUFNLENBQUMsVUFBVUMsT0FBVixFQUFtQkMsT0FBbkIsRUFBNEJDLE1BQTVCLEVBQW9DO0FBQzFDLE1BQUlDLENBQUMsR0FBR0gsT0FBTyxDQUFDLFlBQUQsQ0FBZjs7QUFDQSxNQUFJSSxDQUFDLEdBQUdKLE9BQU8sQ0FBQyxRQUFELENBQWY7O0FBRjBDLE1BSXBDSyxZQUpvQztBQUt6QywwQkFBWUMsSUFBWixFQUFrQjtBQUFBOztBQUNqQixVQUFJQyxFQUFFLEdBQUdKLENBQUMsQ0FBQ0ssTUFBRixDQUFTRixJQUFJLENBQUNDLEVBQWQsQ0FBVDs7QUFDQSxVQUFJRSxLQUFLLEdBQUdOLENBQUMsQ0FBQ0ssTUFBRixDQUFTRixJQUFJLENBQUNHLEtBQWQsQ0FBWjs7QUFDQSxVQUFJQyxLQUFLLEdBQUdQLENBQUMsQ0FBQ0ssTUFBRixDQUFTRixJQUFJLENBQUNJLEtBQWQsQ0FBWjs7QUFFQSxXQUFLQyxNQUFMLEdBQWNQLENBQUMsdUNBQ1NHLEVBRFQsb0tBRW1ERSxLQUZuRCw0UkFLbUVDLEtBTG5FLDJiQUFmO0FBZ0JBTixNQUFBQSxDQUFDLENBQUMsZUFBRCxFQUFrQixLQUFLTyxNQUF2QixDQUFELENBQWdDQyxLQUFoQyxDQUFzQyxZQUFZO0FBQ2pELFlBQUlDLFdBQVcsR0FBR1QsQ0FBQyxDQUFDLE9BQUQsRUFBVSxLQUFLTyxNQUFmLENBQW5CO0FBQ0EsWUFBSUcsV0FBVyxHQUFHQyxRQUFRLENBQUNGLFdBQVcsQ0FBQ0csR0FBWixFQUFELENBQVIsSUFBK0IsQ0FBakQ7QUFDQSxZQUFJQyxVQUFVLEdBQUlILFdBQVcsSUFBSSxDQUFqQztBQUNBRCxRQUFBQSxXQUFXLENBQUNHLEdBQVosQ0FBZ0JDLFVBQWhCO0FBQ0EsZUFBTyxLQUFQO0FBQ0EsT0FORDtBQVFBYixNQUFBQSxDQUFDLENBQUMsaUJBQUQsRUFBb0IsS0FBS08sTUFBekIsQ0FBRCxDQUFrQ0MsS0FBbEMsQ0FBd0MsWUFBWTtBQUNuRCxZQUFJQyxXQUFXLEdBQUdULENBQUMsQ0FBQyxPQUFELEVBQVUsS0FBS08sTUFBZixDQUFuQjtBQUNBLFlBQUlHLFdBQVcsR0FBR0MsUUFBUSxDQUFDRixXQUFXLENBQUNHLEdBQVosRUFBRCxDQUFSLElBQStCLENBQWpEO0FBQ0EsWUFBSUMsVUFBVSxHQUFHQyxJQUFJLENBQUNDLEdBQUwsQ0FBUyxDQUFULEVBQWFMLFdBQVcsSUFBSSxDQUE1QixDQUFqQjtBQUNBRCxRQUFBQSxXQUFXLENBQUNHLEdBQVosQ0FBZ0JDLFVBQWhCO0FBQ0EsZUFBTyxLQUFQO0FBQ0EsT0FORDs7QUFRQSxVQUFJWCxJQUFJLENBQUNjLElBQVQsRUFBZTtBQUNkLFlBQUlDLEtBQUssR0FBR2pCLENBQUMscUNBQTRCRSxJQUFJLENBQUNjLElBQWpDLFlBQWI7QUFDQSxhQUFLVCxNQUFMLENBQVlXLE1BQVosQ0FBbUJELEtBQW5CO0FBQ0E7QUFDRDs7QUE5Q3dDO0FBQUE7QUFBQSxhQWdEekMsb0JBQVc7QUFDVixlQUFPakIsQ0FBQyxDQUFDLE9BQUQsRUFBVSxLQUFLTyxNQUFmLENBQUQsQ0FBd0JLLEdBQXhCLEVBQVA7QUFDQTtBQWxEd0M7QUFBQTtBQUFBLGFBb0R6QyxvQkFBVztBQUNWLGVBQU8sS0FBS0wsTUFBWjtBQUNBO0FBdER3Qzs7QUFBQTtBQUFBOztBQXlEMUMsU0FBT04sWUFBUDtBQUNBLENBMURLLENBQU4iLCJzb3VyY2VzQ29udGVudCI6WyJkZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXHRsZXQgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcblx0bGV0ICQgPSByZXF1aXJlKCdqcXVlcnknKTtcblxuXHRjbGFzcyBTcGlubmVySW5wdXQge1xuXHRcdGNvbnN0cnVjdG9yKGRhdGEpIHtcblx0XHRcdGxldCBpZCA9IF8uZXNjYXBlKGRhdGEuaWQpO1xuXHRcdFx0bGV0IGxhYmVsID0gXy5lc2NhcGUoZGF0YS5sYWJlbCk7XG5cdFx0XHRsZXQgdmFsdWUgPSBfLmVzY2FwZShkYXRhLnZhbHVlKTtcblxuXHRcdFx0dGhpcy4kaW5wdXQgPSAkKGBcbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiJHtpZH1cIiBjbGFzcz1cImNvbnRyb2wtZ3JvdXAgc2hhcmVkLWNvbnRyb2xzLWNvbnRyb2xncm91cCBjb250cm9sLWdyb3VwLWRlZmF1bHRcIj5cbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29udHJvbC1sYWJlbFwiIGZvcj1cImNvbnRyb2wta2V5XCI+JHtsYWJlbH08L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHJvbGU9XCJncm91cFwiIGNsYXNzPVwiY29udHJvbHMgY29udHJvbHMtam9pblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRyb2wgc2hhcmVkLWNvbnRyb2xzLXNwaW5uZXJjb250cm9sIGNvbnRyb2wtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIG5hbWU9XCJpbnB1dFNwaW5uZXJcIiBjbGFzcz1cIlwiIHZhbHVlPVwiJHt2YWx1ZX1cIiBhdXRvY29tcGxldGU9XCJvZmZcIiAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJpbmNyZW1lbnQtZG93blwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aSBjbGFzcz1cImljb24tbWludXNcIj48L2k+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJpbmNyZW1lbnQtdXBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGkgY2xhc3M9XCJpY29uLXBsdXNcIj48L2k+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmApO1xuXG5cdFx0XHQkKCcuaW5jcmVtZW50LXVwJywgdGhpcy4kaW5wdXQpLmNsaWNrKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0bGV0ICR0ZXh0X2lucHV0ID0gJCgnaW5wdXQnLCB0aGlzLiRpbnB1dCk7XG5cdFx0XHRcdGxldCBjdXJyZW50X3ZhbCA9IHBhcnNlSW50KCR0ZXh0X2lucHV0LnZhbCgpKSB8fCAyO1xuXHRcdFx0XHRsZXQgdGFyZ2V0X3ZhbCA9IChjdXJyZW50X3ZhbCArPSAxKTtcblx0XHRcdFx0JHRleHRfaW5wdXQudmFsKHRhcmdldF92YWwpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9KTtcblxuXHRcdFx0JCgnLmluY3JlbWVudC1kb3duJywgdGhpcy4kaW5wdXQpLmNsaWNrKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0bGV0ICR0ZXh0X2lucHV0ID0gJCgnaW5wdXQnLCB0aGlzLiRpbnB1dCk7XG5cdFx0XHRcdGxldCBjdXJyZW50X3ZhbCA9IHBhcnNlSW50KCR0ZXh0X2lucHV0LnZhbCgpKSB8fCAyO1xuXHRcdFx0XHRsZXQgdGFyZ2V0X3ZhbCA9IE1hdGgubWF4KDIsIChjdXJyZW50X3ZhbCAtPSAxKSk7XG5cdFx0XHRcdCR0ZXh0X2lucHV0LnZhbCh0YXJnZXRfdmFsKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChkYXRhLmhlbHApIHtcblx0XHRcdFx0bGV0ICRoZWxwID0gJChgPGRpdiBjbGFzcz1cImhlbHAtYmxvY2tcIj4ke2RhdGEuaGVscH08L2Rpdj5gKTtcblx0XHRcdFx0dGhpcy4kaW5wdXQuYXBwZW5kKCRoZWxwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnZXRWYWx1ZSgpIHtcblx0XHRcdHJldHVybiAkKCdpbnB1dCcsIHRoaXMuJGlucHV0KS52YWwoKTtcblx0XHR9XG5cblx0XHRnZXRJbnB1dCgpIHtcblx0XHRcdHJldHVybiB0aGlzLiRpbnB1dDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gU3Bpbm5lcklucHV0O1xufSk7XG4iXX0=