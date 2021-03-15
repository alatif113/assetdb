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
    }]);

    return TextInput;
  }();

  return TextInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90ZXh0SW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIlRleHRJbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwiJGlucHV0IiwiZWRpdGFibGUiLCJ1bmRlZmluZWQiLCJ2YWx1ZSIsImhlbHAiLCIkaGVscCIsImFwcGVuZCIsInZhbCIsInRleHQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUFBLE1BQU0sQ0FBQyxVQUFVQyxPQUFWLEVBQW1CQyxPQUFuQixFQUE0QkMsTUFBNUIsRUFBb0M7QUFDMUMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFGMEMsTUFJcENLLFNBSm9DO0FBS3pDLHVCQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQ2pCLFVBQUlDLEVBQUUsR0FBR0osQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0MsRUFBZCxDQUFUOztBQUNBLFVBQUlFLEtBQUssR0FBR04sQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0csS0FBZCxDQUFaOztBQUVBLFdBQUtDLE1BQUwsR0FBY04sQ0FBQyx1Q0FDU0csRUFEVCxzSkFFc0NBLEVBRnRDLGdCQUU2Q0UsS0FGN0MsMk5BTVZILElBQUksQ0FBQ0ssUUFBTCxJQUFpQkwsSUFBSSxDQUFDSyxRQUFMLElBQWlCQyxTQUFsQyx5Q0FDK0JMLEVBRC9CLHdEQUN5RUQsSUFBSSxDQUFDTyxLQUQ5RSwwR0FFa0VQLElBQUksQ0FBQ08sS0FGdkUsWUFOVSwwRkFBZjtBQWNBLFdBQUtGLFFBQUwsR0FBZ0JMLElBQUksQ0FBQ0ssUUFBckI7O0FBRUEsVUFBSUwsSUFBSSxDQUFDUSxJQUFULEVBQWU7QUFDZCxZQUFJQyxLQUFLLEdBQUdYLENBQUMscUNBQTRCRSxJQUFJLENBQUNRLElBQWpDLFlBQWI7QUFDQSxhQUFLSixNQUFMLENBQVlNLE1BQVosQ0FBbUJELEtBQW5CO0FBQ0E7QUFDRDs7QUE3QndDO0FBQUE7QUFBQSxhQStCekMsb0JBQVc7QUFDVixlQUFPLEtBQUtKLFFBQUwsR0FBZ0JQLENBQUMsQ0FBQyxPQUFELEVBQVUsS0FBS00sTUFBZixDQUFELENBQXdCTyxHQUF4QixFQUFoQixHQUFnRGIsQ0FBQyxDQUFDLE1BQUQsRUFBUyxLQUFLTSxNQUFkLENBQUQsQ0FBdUJRLElBQXZCLEVBQXZEO0FBQ0E7QUFqQ3dDO0FBQUE7QUFBQSxhQW1DekMsb0JBQVc7QUFDVixlQUFPLEtBQUtSLE1BQVo7QUFDQTtBQXJDd0M7QUFBQTtBQUFBLGFBdUN6QyxzQkFBYTtBQUNaLGVBQU8sS0FBS0MsUUFBWjtBQUNBO0FBekN3Qzs7QUFBQTtBQUFBOztBQTRDMUMsU0FBT04sU0FBUDtBQUNBLENBN0NLLENBQU4iLCJzb3VyY2VzQ29udGVudCI6WyJkZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXHRsZXQgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcblx0bGV0ICQgPSByZXF1aXJlKCdqcXVlcnknKTtcblxuXHRjbGFzcyBUZXh0SW5wdXQge1xuXHRcdGNvbnN0cnVjdG9yKGRhdGEpIHtcblx0XHRcdGxldCBpZCA9IF8uZXNjYXBlKGRhdGEuaWQpO1xuXHRcdFx0bGV0IGxhYmVsID0gXy5lc2NhcGUoZGF0YS5sYWJlbCk7XG5cblx0XHRcdHRoaXMuJGlucHV0ID0gJChgXG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cIiR7aWR9XCIgY2xhc3M9XCJjb250cm9sLWdyb3VwIHNoYXJlZC1jb250cm9scy1jb250cm9sZ3JvdXAgY29udHJvbC1ncm91cC1kZWZhdWx0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbnRyb2wtbGFiZWxcIiBmb3I9XCIke2lkfVwiPiR7bGFiZWx9PC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiByb2xlPVwiZ3JvdXBcIiBjbGFzcz1cImNvbnRyb2xzIGNvbnRyb2xzLWpvaW5cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250cm9sIHNoYXJlZC1jb250cm9scy10ZXh0Y29udHJvbCBjb250cm9sLWRlZmF1bHRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAke1xuXHRcdFx0XHRcdFx0XHRcdGRhdGEuZWRpdGFibGUgfHwgZGF0YS5lZGl0YWJsZSA9PSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0XHRcdD8gYDxpbnB1dCB0eXBlPVwidGV4dFwiIG5hbWU9XCIke2lkfVwiIGFyaWEtbGFiZWw9XCJJbnB1dFwiIGNsYXNzPVwiXCIgdmFsdWU9XCIke2RhdGEudmFsdWV9XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCI+YFxuXHRcdFx0XHRcdFx0XHRcdFx0OiBgPHNwYW4gY2xhc3M9XCJ1bmVkaXRhYmxlLWlucHV0XCIgZGF0YS1yb2xlPVwidW5lZGl0YWJsZS1pbnB1dFwiPiR7ZGF0YS52YWx1ZX08L3NwYW4+YFxuXHRcdFx0XHRcdFx0XHR9XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YCk7XG5cblx0XHRcdHRoaXMuZWRpdGFibGUgPSBkYXRhLmVkaXRhYmxlO1xuXG5cdFx0XHRpZiAoZGF0YS5oZWxwKSB7XG5cdFx0XHRcdGxldCAkaGVscCA9ICQoYDxkaXYgY2xhc3M9XCJoZWxwLWJsb2NrXCI+JHtkYXRhLmhlbHB9PC9kaXY+YCk7XG5cdFx0XHRcdHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2V0VmFsdWUoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0YWJsZSA/ICQoJ2lucHV0JywgdGhpcy4kaW5wdXQpLnZhbCgpIDogJCgnc3BhbicsIHRoaXMuJGlucHV0KS50ZXh0KCk7XG5cdFx0fVxuXG5cdFx0Z2V0SW5wdXQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy4kaW5wdXQ7XG5cdFx0fVxuXG5cdFx0aXNFZGl0YWJsZSgpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRhYmxlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBUZXh0SW5wdXQ7XG59KTtcbiJdfQ==