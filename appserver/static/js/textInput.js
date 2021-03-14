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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90ZXh0SW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIlRleHRJbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwiJGlucHV0IiwiZWRpdGFibGUiLCJ1bmRlZmluZWQiLCJ2YWx1ZSIsImhlbHAiLCIkaGVscCIsImFwcGVuZCIsInZhbCIsInRleHQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUFBLE1BQU0sQ0FBQyxVQUFTQyxPQUFULEVBQWtCQyxPQUFsQixFQUEyQkMsTUFBM0IsRUFBbUM7QUFDdEMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFGc0MsTUFJaENLLFNBSmdDO0FBTWxDLHVCQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQ2QsVUFBSUMsRUFBRSxHQUFHSixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDQyxFQUFkLENBQVQ7O0FBQ0EsVUFBSUUsS0FBSyxHQUFHTixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDRyxLQUFkLENBQVo7O0FBRUEsV0FBS0MsTUFBTCxHQUFjTixDQUFDLHVDQUNBRyxFQURBLHNKQUU2QkEsRUFGN0IsZ0JBRW9DRSxLQUZwQywyTkFLSUgsSUFBSSxDQUFDSyxRQUFMLElBQWlCTCxJQUFJLENBQUNLLFFBQUwsSUFBaUJDLFNBQW5DLHlDQUE0RUwsRUFBNUUsd0RBQXNIRCxJQUFJLENBQUNPLEtBQTNILDBHQUF5TlAsSUFBSSxDQUFDTyxLQUE5TixZQUxILDBGQUFmO0FBV0EsV0FBS0YsUUFBTCxHQUFnQkwsSUFBSSxDQUFDSyxRQUFyQjs7QUFFQSxVQUFJTCxJQUFJLENBQUNRLElBQVQsRUFBZTtBQUNYLFlBQUlDLEtBQUssR0FBR1gsQ0FBQyxxQ0FBNEJFLElBQUksQ0FBQ1EsSUFBakMsWUFBYjtBQUNBLGFBQUtKLE1BQUwsQ0FBWU0sTUFBWixDQUFtQkQsS0FBbkI7QUFDSDtBQUNKOztBQTNCaUM7QUFBQTtBQUFBLGFBNkJsQyxvQkFBVztBQUNQLGVBQVEsS0FBS0osUUFBTixHQUFrQlAsQ0FBQyxDQUFDLE9BQUQsRUFBVSxLQUFLTSxNQUFmLENBQUQsQ0FBd0JPLEdBQXhCLEVBQWxCLEdBQWtEYixDQUFDLENBQUMsTUFBRCxFQUFTLEtBQUtNLE1BQWQsQ0FBRCxDQUF1QlEsSUFBdkIsRUFBekQ7QUFDSDtBQS9CaUM7QUFBQTtBQUFBLGFBaUNsQyxvQkFBVztBQUNQLGVBQU8sS0FBS1IsTUFBWjtBQUNIO0FBbkNpQztBQUFBO0FBQUEsYUFxQ2xDLHNCQUFhO0FBQ1QsZUFBUSxLQUFLQyxRQUFiO0FBQ0g7QUF2Q2lDOztBQUFBO0FBQUE7O0FBMEN0QyxTQUFPTixTQUFQO0FBQ0gsQ0EzQ0ssQ0FBTiIsInNvdXJjZXNDb250ZW50IjpbImRlZmluZShmdW5jdGlvbihyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcbiAgICBsZXQgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcbiAgICBsZXQgJCA9IHJlcXVpcmUoJ2pxdWVyeScpO1xuXG4gICAgY2xhc3MgVGV4dElucHV0IHtcblxuICAgICAgICBjb25zdHJ1Y3RvcihkYXRhKSB7XG4gICAgICAgICAgICBsZXQgaWQgPSBfLmVzY2FwZShkYXRhLmlkKTtcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IF8uZXNjYXBlKGRhdGEubGFiZWwpO1xuXG4gICAgICAgICAgICB0aGlzLiRpbnB1dCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCIke2lkfVwiIGNsYXNzPVwiY29udHJvbC1ncm91cCBzaGFyZWQtY29udHJvbHMtY29udHJvbGdyb3VwIGNvbnRyb2wtZ3JvdXAtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb250cm9sLWxhYmVsXCIgZm9yPVwiJHtpZH1cIj4ke2xhYmVsfTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgcm9sZT1cImdyb3VwXCIgY2xhc3M9XCJjb250cm9scyBjb250cm9scy1qb2luXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udHJvbCBzaGFyZWQtY29udHJvbHMtdGV4dGNvbnRyb2wgY29udHJvbC1kZWZhdWx0XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJHsoZGF0YS5lZGl0YWJsZSB8fCBkYXRhLmVkaXRhYmxlID09IHVuZGVmaW5lZCkgPyBgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgbmFtZT1cIiR7aWR9XCIgYXJpYS1sYWJlbD1cIklucHV0XCIgY2xhc3M9XCJcIiB2YWx1ZT1cIiR7ZGF0YS52YWx1ZX1cIiBhdXRvY29tcGxldGU9XCJvZmZcIj5gIDogYDxzcGFuIGNsYXNzPVwidW5lZGl0YWJsZS1pbnB1dFwiIGRhdGEtcm9sZT1cInVuZWRpdGFibGUtaW5wdXRcIj4ke2RhdGEudmFsdWV9PC9zcGFuPmB9XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgdGhpcy5lZGl0YWJsZSA9IGRhdGEuZWRpdGFibGU7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLmhlbHApIHtcbiAgICAgICAgICAgICAgICBsZXQgJGhlbHAgPSAkKGA8ZGl2IGNsYXNzPVwiaGVscC1ibG9ja1wiPiR7ZGF0YS5oZWxwfTwvZGl2PmApO1xuICAgICAgICAgICAgICAgIHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBnZXRWYWx1ZSgpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy5lZGl0YWJsZSkgPyAkKCdpbnB1dCcsIHRoaXMuJGlucHV0KS52YWwoKSA6ICQoJ3NwYW4nLCB0aGlzLiRpbnB1dCkudGV4dCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0SW5wdXQoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5wdXQ7XG4gICAgICAgIH1cblxuICAgICAgICBpc0VkaXRhYmxlKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmVkaXRhYmxlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBUZXh0SW5wdXQ7XG59KTsiXX0=