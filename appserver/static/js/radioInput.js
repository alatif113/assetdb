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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9yYWRpb0lucHV0LmpzIl0sIm5hbWVzIjpbImRlZmluZSIsInJlcXVpcmUiLCJleHBvcnRzIiwibW9kdWxlIiwiXyIsIiQiLCJSYWRpb0lucHV0IiwiZGF0YSIsImlkIiwiZXNjYXBlIiwibGFiZWwiLCIkaW5wdXQiLCJjaG9pY2VzIiwiZm9yRWFjaCIsImNob2ljZSIsInZhbHVlIiwiJGJ1dHRvbiIsImFwcGVuZCIsIm9uIiwiZSIsImN1cnJWYWwiLCJhdHRyIiwidGFyZ1ZhbCIsInRhcmdldCIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJ0cmlnZ2VyIiwiaGVscCIsIiRoZWxwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBQSxNQUFNLENBQUMsVUFBU0MsT0FBVCxFQUFrQkMsT0FBbEIsRUFBMkJDLE1BQTNCLEVBQW1DO0FBQ3RDLE1BQUlDLENBQUMsR0FBR0gsT0FBTyxDQUFDLFlBQUQsQ0FBZjs7QUFDQSxNQUFJSSxDQUFDLEdBQUdKLE9BQU8sQ0FBQyxRQUFELENBQWY7O0FBRnNDLE1BSWhDSyxVQUpnQztBQU1sQyx3QkFBWUMsSUFBWixFQUFrQjtBQUFBOztBQUFBOztBQUNkLFVBQUlDLEVBQUUsR0FBR0osQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0MsRUFBZCxDQUFUOztBQUNBLFVBQUlFLEtBQUssR0FBR04sQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0csS0FBZCxDQUFaOztBQUVBLFdBQUtDLE1BQUwsR0FBY04sQ0FBQyx1Q0FDQUcsRUFEQSxvS0FFMENFLEtBRjFDLG1UQUFmO0FBU0FILE1BQUFBLElBQUksQ0FBQ0ssT0FBTCxDQUFhQyxPQUFiLENBQXFCLFVBQUNDLE1BQUQsRUFBWTtBQUM3QixZQUFJSixLQUFLLEdBQUdOLENBQUMsQ0FBQ0ssTUFBRixDQUFTSyxNQUFNLENBQUNKLEtBQWhCLENBQVo7O0FBQ0EsWUFBSUssS0FBSyxHQUFHWCxDQUFDLENBQUNLLE1BQUYsQ0FBU0ssTUFBTSxDQUFDQyxLQUFoQixDQUFaOztBQUVBLFlBQUlDLE9BQU8sR0FBR1gsQ0FBQywwRkFBNEVLLEtBQTVFLDRCQUFrR0ksTUFBTSxDQUFDQyxLQUFQLElBQWdCUixJQUFJLENBQUNRLEtBQXRCLEdBQStCLFFBQS9CLEdBQTBDLEVBQTNJLDZCQUE4SkEsS0FBOUosdUNBQTZMTCxLQUE3TCxlQUFmO0FBQ0FMLFFBQUFBLENBQUMsQ0FBQyxrQkFBRCxFQUFxQixLQUFJLENBQUNNLE1BQTFCLENBQUQsQ0FBbUNNLE1BQW5DLENBQTBDRCxPQUExQztBQUNILE9BTkQ7QUFRQVgsTUFBQUEsQ0FBQyxDQUFDLFFBQUQsRUFBVyxLQUFLTSxNQUFoQixDQUFELENBQXlCTyxFQUF6QixDQUE0QixPQUE1QixFQUFxQyxVQUFDQyxDQUFELEVBQU87QUFDeEMsWUFBSUMsT0FBTyxHQUFHZixDQUFDLENBQUMsZUFBRCxFQUFrQixLQUFJLENBQUNNLE1BQXZCLENBQUQsQ0FBZ0NVLElBQWhDLENBQXFDLFlBQXJDLENBQWQ7QUFDQSxZQUFJQyxPQUFPLEdBQUdqQixDQUFDLENBQUNjLENBQUMsQ0FBQ0ksTUFBSCxDQUFELENBQVlGLElBQVosQ0FBaUIsWUFBakIsQ0FBZDs7QUFDQSxZQUFJRCxPQUFPLElBQUlFLE9BQWYsRUFBd0I7QUFDcEJqQixVQUFBQSxDQUFDLENBQUMsZUFBRCxFQUFrQixLQUFJLENBQUNNLE1BQXZCLENBQUQsQ0FBZ0NhLFdBQWhDLENBQTRDLFFBQTVDO0FBQ0FuQixVQUFBQSxDQUFDLENBQUNjLENBQUMsQ0FBQ0ksTUFBSCxDQUFELENBQVlFLFFBQVosQ0FBcUIsUUFBckI7O0FBQ0EsVUFBQSxLQUFJLENBQUNkLE1BQUwsQ0FBWWUsT0FBWixDQUFvQixRQUFwQixFQUE4QjtBQUFDWCxZQUFBQSxLQUFLLEVBQUVWLENBQUMsQ0FBQ2MsQ0FBQyxDQUFDSSxNQUFILENBQUQsQ0FBWUYsSUFBWixDQUFpQixZQUFqQjtBQUFSLFdBQTlCO0FBQ0g7QUFDSixPQVJEOztBQVVBLFVBQUlkLElBQUksQ0FBQ29CLElBQVQsRUFBZTtBQUNYLFlBQUlDLEtBQUssR0FBR3ZCLENBQUMscUNBQTRCRSxJQUFJLENBQUNvQixJQUFqQyxZQUFiO0FBQ0EsYUFBS2hCLE1BQUwsQ0FBWU0sTUFBWixDQUFtQlcsS0FBbkI7QUFDSDtBQUNKOztBQXpDaUM7QUFBQTtBQUFBLGFBMkNsQyxvQkFBVztBQUNQLGVBQU92QixDQUFDLENBQUMsZUFBRCxFQUFrQixLQUFLTSxNQUF2QixDQUFELENBQWdDVSxJQUFoQyxDQUFxQyxZQUFyQyxDQUFQO0FBQ0g7QUE3Q2lDO0FBQUE7QUFBQSxhQStDbEMsb0JBQVc7QUFDUCxlQUFPLEtBQUtWLE1BQVo7QUFDSDtBQWpEaUM7O0FBQUE7QUFBQTs7QUFvRHRDLFNBQU9MLFVBQVA7QUFDSCxDQXJESyxDQUFOIiwic291cmNlc0NvbnRlbnQiOlsiZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuICAgIGxldCBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xuICAgIGxldCAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cbiAgICBjbGFzcyBSYWRpb0lucHV0IHtcblxuICAgICAgICBjb25zdHJ1Y3RvcihkYXRhKSB7XG4gICAgICAgICAgICBsZXQgaWQgPSBfLmVzY2FwZShkYXRhLmlkKTtcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IF8uZXNjYXBlKGRhdGEubGFiZWwpO1xuXG4gICAgICAgICAgICB0aGlzLiRpbnB1dCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCIke2lkfVwiIGNsYXNzPVwiY29udHJvbC1ncm91cCBzaGFyZWQtY29udHJvbHMtY29udHJvbGdyb3VwIGNvbnRyb2wtZ3JvdXAtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb250cm9sLWxhYmVsXCIgZm9yPVwiY29udHJvbC1rZXlcIj4ke2xhYmVsfTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgcm9sZT1cImdyb3VwXCIgY2xhc3M9XCJjb250cm9scyBjb250cm9scy1qb2luXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udHJvbCBidG4tZ3JvdXAgYnRuLWdyb3VwLXJhZGlvIHNoYXJlZC1jb250cm9scy1zeW50aGV0aWNyYWRpb2NvbnRyb2wgY29udHJvbC1kZWZhdWx0XCIgZGF0YS1uYW1lPVwiaW5wdXRSYWRpb1RvZ2dsZVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBkYXRhLmNob2ljZXMuZm9yRWFjaCgoY2hvaWNlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IGxhYmVsID0gXy5lc2NhcGUoY2hvaWNlLmxhYmVsKTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsdWUgPSBfLmVzY2FwZShjaG9pY2UudmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgbGV0ICRidXR0b24gPSAkKGA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiByb2xlPVwiYnV0dG9uXCIgbmFtZT1cImlucHV0UmFkaW9Ub2dnbGVcIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIiBjbGFzcz1cImJ0biAkeyhjaG9pY2UudmFsdWUgPT0gZGF0YS52YWx1ZSkgPyAnYWN0aXZlJyA6ICcnfVwiIGRhdGEtdmFsdWU9XCIke3ZhbHVlfVwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCI+JHtsYWJlbH08L2J1dHRvbj5gKTtcbiAgICAgICAgICAgICAgICAkKCcuYnRuLWdyb3VwLXJhZGlvJywgdGhpcy4kaW5wdXQpLmFwcGVuZCgkYnV0dG9uKTtcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICQoJ2J1dHRvbicsIHRoaXMuJGlucHV0KS5vbignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyVmFsID0gJCgnYnV0dG9uLmFjdGl2ZScsIHRoaXMuJGlucHV0KS5hdHRyKCdkYXRhLXZhbHVlJyk7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdWYWwgPSAkKGUudGFyZ2V0KS5hdHRyKCdkYXRhLXZhbHVlJyk7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJWYWwgIT0gdGFyZ1ZhbCkge1xuICAgICAgICAgICAgICAgICAgICAkKCdidXR0b24uYWN0aXZlJywgdGhpcy4kaW5wdXQpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICAgICAgICAgJChlLnRhcmdldCkuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRpbnB1dC50cmlnZ2VyKCdjaGFuZ2UnLCB7dmFsdWU6ICQoZS50YXJnZXQpLmF0dHIoJ2RhdGEtdmFsdWUnKX0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIGlmIChkYXRhLmhlbHApIHtcbiAgICAgICAgICAgICAgICBsZXQgJGhlbHAgPSAkKGA8ZGl2IGNsYXNzPVwiaGVscC1ibG9ja1wiPiR7ZGF0YS5oZWxwfTwvZGl2PmApO1xuICAgICAgICAgICAgICAgIHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBnZXRWYWx1ZSgpIHtcbiAgICAgICAgICAgIHJldHVybiAkKCdidXR0b24uYWN0aXZlJywgdGhpcy4kaW5wdXQpLmF0dHIoJ2RhdGEtdmFsdWUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldElucHV0KCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJGlucHV0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFJhZGlvSW5wdXQ7XG59KTsiXX0=