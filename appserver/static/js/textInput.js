"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var TextInput = /*#__PURE__*/function () {
    function TextInput(data) {
      _classCallCheck(this, TextInput);

      var id = _.escape(data.id);

      var label = _.escape(data.label);

      this.$input = $("\n                <div id=\"".concat(id, "\" class=\"control-group shared-controls-controlgroup control-group-default\">\n                    <label class=\"control-label\" for=\"").concat(id, "\">").concat(label, "</label>\n                    <div role=\"group\" class=\"controls controls-join\">\n                        <div class=\"control shared-controls-textcontrol control-default\">\n                            ").concat(data.editable || data.editable == undefined ? "<input type=\"text\" name=\"".concat(id, "\" aria-label=\"Input\" class=\"\" value=\"").concat(data.value, "\" autocomplete=\"off\">") : "<span class=\"uneditable-input\" data-role=\"uneditable-input\">".concat(data.value, "</span>"), "\n                        </div>\n                    </div>\n                </div>"));
      this.editable = data.editable;

      if (data.help) {
        var $help = $("<div class=\"help-block\">".concat(data.help, "</div>"));
        this.$input.append($help);
      }
    }

    _createClass(TextInput, [{
      key: "getValue",
      value: function getValue() {
        return this.editable ? $('input', this.$input).val() : $('span', this.$input).text();
      }
    }, {
      key: "getInput",
      value: function getInput() {
        return this.$input;
      }
    }, {
      key: "isEditable",
      value: function isEditable() {
        return this.editable;
      }
    }, {
      key: "setError",
      value: function setError(error) {
        $('.error-block', this.$input).remove();
        var $error = $("<div class=\"error-block\">".concat(error, "</div>"));
        this.$input.append($error);
      }
    }]);

    return TextInput;
  }();

  return TextInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90ZXh0SW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIlRleHRJbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwiJGlucHV0IiwiZWRpdGFibGUiLCJ1bmRlZmluZWQiLCJ2YWx1ZSIsImhlbHAiLCIkaGVscCIsImFwcGVuZCIsInZhbCIsInRleHQiLCJlcnJvciIsInJlbW92ZSIsIiRlcnJvciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDLFVBQVVDLE9BQVYsRUFBbUJDLE9BQW5CLEVBQTRCQyxNQUE1QixFQUFvQztBQUMxQyxNQUFJQyxDQUFDLEdBQUdILE9BQU8sQ0FBQyxZQUFELENBQWY7O0FBQ0EsTUFBSUksQ0FBQyxHQUFHSixPQUFPLENBQUMsUUFBRCxDQUFmOztBQUYwQyxNQUlwQ0ssU0FKb0M7QUFLekMsdUJBQVlDLElBQVosRUFBa0I7QUFBQTs7QUFDakIsVUFBSUMsRUFBRSxHQUFHSixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDQyxFQUFkLENBQVQ7O0FBQ0EsVUFBSUUsS0FBSyxHQUFHTixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDRyxLQUFkLENBQVo7O0FBRUEsV0FBS0MsTUFBTCxHQUFjTixDQUFDLHVDQUNTRyxFQURULHNKQUVzQ0EsRUFGdEMsZ0JBRTZDRSxLQUY3QywyTkFNVkgsSUFBSSxDQUFDSyxRQUFMLElBQWlCTCxJQUFJLENBQUNLLFFBQUwsSUFBaUJDLFNBQWxDLHlDQUMrQkwsRUFEL0Isd0RBQ3lFRCxJQUFJLENBQUNPLEtBRDlFLDBHQUVrRVAsSUFBSSxDQUFDTyxLQUZ2RSxZQU5VLDBGQUFmO0FBY0EsV0FBS0YsUUFBTCxHQUFnQkwsSUFBSSxDQUFDSyxRQUFyQjs7QUFFQSxVQUFJTCxJQUFJLENBQUNRLElBQVQsRUFBZTtBQUNkLFlBQUlDLEtBQUssR0FBR1gsQ0FBQyxxQ0FBNEJFLElBQUksQ0FBQ1EsSUFBakMsWUFBYjtBQUNBLGFBQUtKLE1BQUwsQ0FBWU0sTUFBWixDQUFtQkQsS0FBbkI7QUFDQTtBQUNEOztBQTdCd0M7QUFBQTtBQUFBLGFBK0J6QyxvQkFBVztBQUNWLGVBQU8sS0FBS0osUUFBTCxHQUFnQlAsQ0FBQyxDQUFDLE9BQUQsRUFBVSxLQUFLTSxNQUFmLENBQUQsQ0FBd0JPLEdBQXhCLEVBQWhCLEdBQWdEYixDQUFDLENBQUMsTUFBRCxFQUFTLEtBQUtNLE1BQWQsQ0FBRCxDQUF1QlEsSUFBdkIsRUFBdkQ7QUFDQTtBQWpDd0M7QUFBQTtBQUFBLGFBbUN6QyxvQkFBVztBQUNWLGVBQU8sS0FBS1IsTUFBWjtBQUNBO0FBckN3QztBQUFBO0FBQUEsYUF1Q3pDLHNCQUFhO0FBQ1osZUFBTyxLQUFLQyxRQUFaO0FBQ0E7QUF6Q3dDO0FBQUE7QUFBQSxhQTJDekMsa0JBQVNRLEtBQVQsRUFBZ0I7QUFDZmYsUUFBQUEsQ0FBQyxDQUFDLGNBQUQsRUFBaUIsS0FBS00sTUFBdEIsQ0FBRCxDQUErQlUsTUFBL0I7QUFDQSxZQUFJQyxNQUFNLEdBQUdqQixDQUFDLHNDQUE2QmUsS0FBN0IsWUFBZDtBQUNBLGFBQUtULE1BQUwsQ0FBWU0sTUFBWixDQUFtQkssTUFBbkI7QUFDQTtBQS9Dd0M7O0FBQUE7QUFBQTs7QUFrRDFDLFNBQU9oQixTQUFQO0FBQ0EsQ0FuREssQ0FBTiIsInNvdXJjZXNDb250ZW50IjpbImRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cdGxldCBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xuXHRsZXQgJCA9IHJlcXVpcmUoJ2pxdWVyeScpO1xuXG5cdGNsYXNzIFRleHRJbnB1dCB7XG5cdFx0Y29uc3RydWN0b3IoZGF0YSkge1xuXHRcdFx0bGV0IGlkID0gXy5lc2NhcGUoZGF0YS5pZCk7XG5cdFx0XHRsZXQgbGFiZWwgPSBfLmVzY2FwZShkYXRhLmxhYmVsKTtcblxuXHRcdFx0dGhpcy4kaW5wdXQgPSAkKGBcbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiJHtpZH1cIiBjbGFzcz1cImNvbnRyb2wtZ3JvdXAgc2hhcmVkLWNvbnRyb2xzLWNvbnRyb2xncm91cCBjb250cm9sLWdyb3VwLWRlZmF1bHRcIj5cbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29udHJvbC1sYWJlbFwiIGZvcj1cIiR7aWR9XCI+JHtsYWJlbH08L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHJvbGU9XCJncm91cFwiIGNsYXNzPVwiY29udHJvbHMgY29udHJvbHMtam9pblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRyb2wgc2hhcmVkLWNvbnRyb2xzLXRleHRjb250cm9sIGNvbnRyb2wtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICR7XG5cdFx0XHRcdFx0XHRcdFx0ZGF0YS5lZGl0YWJsZSB8fCBkYXRhLmVkaXRhYmxlID09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHRcdFx0PyBgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgbmFtZT1cIiR7aWR9XCIgYXJpYS1sYWJlbD1cIklucHV0XCIgY2xhc3M9XCJcIiB2YWx1ZT1cIiR7ZGF0YS52YWx1ZX1cIiBhdXRvY29tcGxldGU9XCJvZmZcIj5gXG5cdFx0XHRcdFx0XHRcdFx0XHQ6IGA8c3BhbiBjbGFzcz1cInVuZWRpdGFibGUtaW5wdXRcIiBkYXRhLXJvbGU9XCJ1bmVkaXRhYmxlLWlucHV0XCI+JHtkYXRhLnZhbHVlfTwvc3Bhbj5gXG5cdFx0XHRcdFx0XHRcdH1cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gKTtcblxuXHRcdFx0dGhpcy5lZGl0YWJsZSA9IGRhdGEuZWRpdGFibGU7XG5cblx0XHRcdGlmIChkYXRhLmhlbHApIHtcblx0XHRcdFx0bGV0ICRoZWxwID0gJChgPGRpdiBjbGFzcz1cImhlbHAtYmxvY2tcIj4ke2RhdGEuaGVscH08L2Rpdj5gKTtcblx0XHRcdFx0dGhpcy4kaW5wdXQuYXBwZW5kKCRoZWxwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnZXRWYWx1ZSgpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRhYmxlID8gJCgnaW5wdXQnLCB0aGlzLiRpbnB1dCkudmFsKCkgOiAkKCdzcGFuJywgdGhpcy4kaW5wdXQpLnRleHQoKTtcblx0XHR9XG5cblx0XHRnZXRJbnB1dCgpIHtcblx0XHRcdHJldHVybiB0aGlzLiRpbnB1dDtcblx0XHR9XG5cblx0XHRpc0VkaXRhYmxlKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZWRpdGFibGU7XG5cdFx0fVxuXG5cdFx0c2V0RXJyb3IoZXJyb3IpIHtcblx0XHRcdCQoJy5lcnJvci1ibG9jaycsIHRoaXMuJGlucHV0KS5yZW1vdmUoKTtcblx0XHRcdGxldCAkZXJyb3IgPSAkKGA8ZGl2IGNsYXNzPVwiZXJyb3ItYmxvY2tcIj4ke2Vycm9yfTwvZGl2PmApO1xuXHRcdFx0dGhpcy4kaW5wdXQuYXBwZW5kKCRlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFRleHRJbnB1dDtcbn0pO1xuIl19