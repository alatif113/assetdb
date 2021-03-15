"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var RadioInput = /*#__PURE__*/function () {
    function RadioInput(data) {
      var _this = this;

      _classCallCheck(this, RadioInput);

      var id = _.escape(data.id);

      var label = _.escape(data.label);

      this.$input = $("\n                <div id=\"".concat(id, "\" class=\"control-group shared-controls-controlgroup control-group-default\">\n                    <label class=\"control-label\" for=\"control-key\">").concat(label, "</label>\n                    <div role=\"group\" class=\"controls controls-join\">\n                        <div class=\"control btn-group btn-group-radio shared-controls-syntheticradiocontrol control-default\" data-name=\"inputRadioToggle\"></div>\n                    </div>\n                </div>"));
      data.choices.forEach(function (choice) {
        var label = _.escape(choice.label);

        var value = _.escape(choice.value);

        var $button = $("<button type=\"button\" role=\"button\" name=\"inputRadioToggle\" aria-label=\"".concat(label, "\" class=\"btn ").concat(choice.value == data.value ? 'active' : '', "\" data-value=\"").concat(value, "\" aria-pressed=\"false\">").concat(label, "</button>"));
        $('.btn-group-radio', _this.$input).append($button);
      });
      $('button', this.$input).on('click', function (e) {
        var currVal = $('button.active', _this.$input).attr('data-value');
        var targVal = $(e.target).attr('data-value');

        if (currVal != targVal) {
          $('button.active', _this.$input).removeClass('active');
          $(e.target).addClass('active');

          _this.$input.trigger('change', {
            value: $(e.target).attr('data-value')
          });
        }
      });

      if (data.help) {
        var $help = $("<div class=\"help-block\">".concat(data.help, "</div>"));
        this.$input.append($help);
      }
    }

    _createClass(RadioInput, [{
      key: "getValue",
      value: function getValue() {
        return $('button.active', this.$input).attr('data-value');
      }
    }, {
      key: "getInput",
      value: function getInput() {
        return this.$input;
      }
    }]);

    return RadioInput;
  }();

  return RadioInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9yYWRpb0lucHV0LmpzIl0sIm5hbWVzIjpbImRlZmluZSIsInJlcXVpcmUiLCJleHBvcnRzIiwibW9kdWxlIiwiXyIsIiQiLCJSYWRpb0lucHV0IiwiZGF0YSIsImlkIiwiZXNjYXBlIiwibGFiZWwiLCIkaW5wdXQiLCJjaG9pY2VzIiwiZm9yRWFjaCIsImNob2ljZSIsInZhbHVlIiwiJGJ1dHRvbiIsImFwcGVuZCIsIm9uIiwiZSIsImN1cnJWYWwiLCJhdHRyIiwidGFyZ1ZhbCIsInRhcmdldCIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJ0cmlnZ2VyIiwiaGVscCIsIiRoZWxwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBQSxNQUFNLENBQUMsVUFBVUMsT0FBVixFQUFtQkMsT0FBbkIsRUFBNEJDLE1BQTVCLEVBQW9DO0FBQzFDLE1BQUlDLENBQUMsR0FBR0gsT0FBTyxDQUFDLFlBQUQsQ0FBZjs7QUFDQSxNQUFJSSxDQUFDLEdBQUdKLE9BQU8sQ0FBQyxRQUFELENBQWY7O0FBRjBDLE1BSXBDSyxVQUpvQztBQUt6Qyx3QkFBWUMsSUFBWixFQUFrQjtBQUFBOztBQUFBOztBQUNqQixVQUFJQyxFQUFFLEdBQUdKLENBQUMsQ0FBQ0ssTUFBRixDQUFTRixJQUFJLENBQUNDLEVBQWQsQ0FBVDs7QUFDQSxVQUFJRSxLQUFLLEdBQUdOLENBQUMsQ0FBQ0ssTUFBRixDQUFTRixJQUFJLENBQUNHLEtBQWQsQ0FBWjs7QUFFQSxXQUFLQyxNQUFMLEdBQWNOLENBQUMsdUNBQ1NHLEVBRFQsb0tBRW1ERSxLQUZuRCxtVEFBZjtBQVFBSCxNQUFBQSxJQUFJLENBQUNLLE9BQUwsQ0FBYUMsT0FBYixDQUFxQixVQUFDQyxNQUFELEVBQVk7QUFDaEMsWUFBSUosS0FBSyxHQUFHTixDQUFDLENBQUNLLE1BQUYsQ0FBU0ssTUFBTSxDQUFDSixLQUFoQixDQUFaOztBQUNBLFlBQUlLLEtBQUssR0FBR1gsQ0FBQyxDQUFDSyxNQUFGLENBQVNLLE1BQU0sQ0FBQ0MsS0FBaEIsQ0FBWjs7QUFFQSxZQUFJQyxPQUFPLEdBQUdYLENBQUMsMEZBQzZESyxLQUQ3RCw0QkFFYkksTUFBTSxDQUFDQyxLQUFQLElBQWdCUixJQUFJLENBQUNRLEtBQXJCLEdBQTZCLFFBQTdCLEdBQXdDLEVBRjNCLDZCQUdHQSxLQUhILHVDQUdrQ0wsS0FIbEMsZUFBZjtBQUtBTCxRQUFBQSxDQUFDLENBQUMsa0JBQUQsRUFBcUIsS0FBSSxDQUFDTSxNQUExQixDQUFELENBQW1DTSxNQUFuQyxDQUEwQ0QsT0FBMUM7QUFDQSxPQVZEO0FBWUFYLE1BQUFBLENBQUMsQ0FBQyxRQUFELEVBQVcsS0FBS00sTUFBaEIsQ0FBRCxDQUF5Qk8sRUFBekIsQ0FBNEIsT0FBNUIsRUFBcUMsVUFBQ0MsQ0FBRCxFQUFPO0FBQzNDLFlBQUlDLE9BQU8sR0FBR2YsQ0FBQyxDQUFDLGVBQUQsRUFBa0IsS0FBSSxDQUFDTSxNQUF2QixDQUFELENBQWdDVSxJQUFoQyxDQUFxQyxZQUFyQyxDQUFkO0FBQ0EsWUFBSUMsT0FBTyxHQUFHakIsQ0FBQyxDQUFDYyxDQUFDLENBQUNJLE1BQUgsQ0FBRCxDQUFZRixJQUFaLENBQWlCLFlBQWpCLENBQWQ7O0FBQ0EsWUFBSUQsT0FBTyxJQUFJRSxPQUFmLEVBQXdCO0FBQ3ZCakIsVUFBQUEsQ0FBQyxDQUFDLGVBQUQsRUFBa0IsS0FBSSxDQUFDTSxNQUF2QixDQUFELENBQWdDYSxXQUFoQyxDQUE0QyxRQUE1QztBQUNBbkIsVUFBQUEsQ0FBQyxDQUFDYyxDQUFDLENBQUNJLE1BQUgsQ0FBRCxDQUFZRSxRQUFaLENBQXFCLFFBQXJCOztBQUNBLFVBQUEsS0FBSSxDQUFDZCxNQUFMLENBQVllLE9BQVosQ0FBb0IsUUFBcEIsRUFBOEI7QUFBRVgsWUFBQUEsS0FBSyxFQUFFVixDQUFDLENBQUNjLENBQUMsQ0FBQ0ksTUFBSCxDQUFELENBQVlGLElBQVosQ0FBaUIsWUFBakI7QUFBVCxXQUE5QjtBQUNBO0FBQ0QsT0FSRDs7QUFVQSxVQUFJZCxJQUFJLENBQUNvQixJQUFULEVBQWU7QUFDZCxZQUFJQyxLQUFLLEdBQUd2QixDQUFDLHFDQUE0QkUsSUFBSSxDQUFDb0IsSUFBakMsWUFBYjtBQUNBLGFBQUtoQixNQUFMLENBQVlNLE1BQVosQ0FBbUJXLEtBQW5CO0FBQ0E7QUFDRDs7QUEzQ3dDO0FBQUE7QUFBQSxhQTZDekMsb0JBQVc7QUFDVixlQUFPdkIsQ0FBQyxDQUFDLGVBQUQsRUFBa0IsS0FBS00sTUFBdkIsQ0FBRCxDQUFnQ1UsSUFBaEMsQ0FBcUMsWUFBckMsQ0FBUDtBQUNBO0FBL0N3QztBQUFBO0FBQUEsYUFpRHpDLG9CQUFXO0FBQ1YsZUFBTyxLQUFLVixNQUFaO0FBQ0E7QUFuRHdDOztBQUFBO0FBQUE7O0FBc0QxQyxTQUFPTCxVQUFQO0FBQ0EsQ0F2REssQ0FBTiIsInNvdXJjZXNDb250ZW50IjpbImRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cdGxldCBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xuXHRsZXQgJCA9IHJlcXVpcmUoJ2pxdWVyeScpO1xuXG5cdGNsYXNzIFJhZGlvSW5wdXQge1xuXHRcdGNvbnN0cnVjdG9yKGRhdGEpIHtcblx0XHRcdGxldCBpZCA9IF8uZXNjYXBlKGRhdGEuaWQpO1xuXHRcdFx0bGV0IGxhYmVsID0gXy5lc2NhcGUoZGF0YS5sYWJlbCk7XG5cblx0XHRcdHRoaXMuJGlucHV0ID0gJChgXG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cIiR7aWR9XCIgY2xhc3M9XCJjb250cm9sLWdyb3VwIHNoYXJlZC1jb250cm9scy1jb250cm9sZ3JvdXAgY29udHJvbC1ncm91cC1kZWZhdWx0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbnRyb2wtbGFiZWxcIiBmb3I9XCJjb250cm9sLWtleVwiPiR7bGFiZWx9PC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiByb2xlPVwiZ3JvdXBcIiBjbGFzcz1cImNvbnRyb2xzIGNvbnRyb2xzLWpvaW5cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250cm9sIGJ0bi1ncm91cCBidG4tZ3JvdXAtcmFkaW8gc2hhcmVkLWNvbnRyb2xzLXN5bnRoZXRpY3JhZGlvY29udHJvbCBjb250cm9sLWRlZmF1bHRcIiBkYXRhLW5hbWU9XCJpbnB1dFJhZGlvVG9nZ2xlXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmApO1xuXG5cdFx0XHRkYXRhLmNob2ljZXMuZm9yRWFjaCgoY2hvaWNlKSA9PiB7XG5cdFx0XHRcdGxldCBsYWJlbCA9IF8uZXNjYXBlKGNob2ljZS5sYWJlbCk7XG5cdFx0XHRcdGxldCB2YWx1ZSA9IF8uZXNjYXBlKGNob2ljZS52YWx1ZSk7XG5cblx0XHRcdFx0bGV0ICRidXR0b24gPSAkKFxuXHRcdFx0XHRcdGA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiByb2xlPVwiYnV0dG9uXCIgbmFtZT1cImlucHV0UmFkaW9Ub2dnbGVcIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIiBjbGFzcz1cImJ0biAke1xuXHRcdFx0XHRcdFx0Y2hvaWNlLnZhbHVlID09IGRhdGEudmFsdWUgPyAnYWN0aXZlJyA6ICcnXG5cdFx0XHRcdFx0fVwiIGRhdGEtdmFsdWU9XCIke3ZhbHVlfVwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+JHtsYWJlbH08L2J1dHRvbj5gXG5cdFx0XHRcdCk7XG5cdFx0XHRcdCQoJy5idG4tZ3JvdXAtcmFkaW8nLCB0aGlzLiRpbnB1dCkuYXBwZW5kKCRidXR0b24pO1xuXHRcdFx0fSk7XG5cblx0XHRcdCQoJ2J1dHRvbicsIHRoaXMuJGlucHV0KS5vbignY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0XHRsZXQgY3VyclZhbCA9ICQoJ2J1dHRvbi5hY3RpdmUnLCB0aGlzLiRpbnB1dCkuYXR0cignZGF0YS12YWx1ZScpO1xuXHRcdFx0XHRsZXQgdGFyZ1ZhbCA9ICQoZS50YXJnZXQpLmF0dHIoJ2RhdGEtdmFsdWUnKTtcblx0XHRcdFx0aWYgKGN1cnJWYWwgIT0gdGFyZ1ZhbCkge1xuXHRcdFx0XHRcdCQoJ2J1dHRvbi5hY3RpdmUnLCB0aGlzLiRpbnB1dCkucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuXHRcdFx0XHRcdCQoZS50YXJnZXQpLmFkZENsYXNzKCdhY3RpdmUnKTtcblx0XHRcdFx0XHR0aGlzLiRpbnB1dC50cmlnZ2VyKCdjaGFuZ2UnLCB7IHZhbHVlOiAkKGUudGFyZ2V0KS5hdHRyKCdkYXRhLXZhbHVlJykgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZGF0YS5oZWxwKSB7XG5cdFx0XHRcdGxldCAkaGVscCA9ICQoYDxkaXYgY2xhc3M9XCJoZWxwLWJsb2NrXCI+JHtkYXRhLmhlbHB9PC9kaXY+YCk7XG5cdFx0XHRcdHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2V0VmFsdWUoKSB7XG5cdFx0XHRyZXR1cm4gJCgnYnV0dG9uLmFjdGl2ZScsIHRoaXMuJGlucHV0KS5hdHRyKCdkYXRhLXZhbHVlJyk7XG5cdFx0fVxuXG5cdFx0Z2V0SW5wdXQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy4kaW5wdXQ7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFJhZGlvSW5wdXQ7XG59KTtcbiJdfQ==