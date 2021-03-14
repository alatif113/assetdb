"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var BooleanInput = /*#__PURE__*/function () {
    function BooleanInput(data) {
      var _this = this;

      _classCallCheck(this, BooleanInput);

      var id = _.escape(data.id);

      var label = _.escape(data.label);

      var trueLabel = _.escape(data.trueLabel);

      var falseLabel = _.escape(data.falseLabel);

      this.$input = $("\n                <div id=\"".concat(id, "\" class=\"control-group shared-controls-controlgroup control-group-default\">\n                    <label class=\"control-label\" for=\"control-key\">").concat(label, "</label>\n                    <div role=\"group\" class=\"controls controls-join\">\n                        <div class=\"control btn-group btn-group-radio shared-controls-booleanradiocontrol control-default\">\n                            <button type=\"button\" role=\"button\" name=\"inputRadioBoolean\" aria-label=\"").concat(trueLabel, "\" class=\"btn ").concat(data.value ? 'active' : '', "\" data-value=\"1\" aria-pressed=\"false\">").concat(trueLabel, "</button>\n                            <button type=\"button\" role=\"button\" name=\"inputRadioBoolean\" aria-label=\"").concat(falseLabel, "\" class=\"btn ").concat(!data.value ? 'active' : '', "\" data-value=\"0\" aria-pressed=\"true\">").concat(falseLabel, "</button>\n                        </div>\n                    </div>\n                </div>\n            "));
      $('button', this.$input).on('click', function (e) {
        var currVal = $('button.active', _this.$input).attr('data-value');
        var targVal = $(e.target).attr('data-value');

        if (currVal != targVal) {
          $('button.active', _this.$input).removeClass('active');
          $(e.target).addClass('active');

          _this.$input.trigger('change', {
            value: $(_this).attr('data-value')
          });
        }
      });

      if (data.help) {
        var $help = $("<div class=\"help-block\">".concat(data.help, "</div>"));
        this.$input.append($help);
      }
    }

    _createClass(BooleanInput, [{
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

    return BooleanInput;
  }();

  return BooleanInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9ib29sZWFuSW5wdXQuanMiXSwibmFtZXMiOlsiZGVmaW5lIiwicmVxdWlyZSIsImV4cG9ydHMiLCJtb2R1bGUiLCJfIiwiJCIsIkJvb2xlYW5JbnB1dCIsImRhdGEiLCJpZCIsImVzY2FwZSIsImxhYmVsIiwidHJ1ZUxhYmVsIiwiZmFsc2VMYWJlbCIsIiRpbnB1dCIsInZhbHVlIiwib24iLCJlIiwiY3VyclZhbCIsImF0dHIiLCJ0YXJnVmFsIiwidGFyZ2V0IiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsInRyaWdnZXIiLCJoZWxwIiwiJGhlbHAiLCJhcHBlbmQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQ0FBLE1BQU0sQ0FBQyxVQUFTQyxPQUFULEVBQWtCQyxPQUFsQixFQUEyQkMsTUFBM0IsRUFBbUM7QUFDdEMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFGc0MsTUFJaENLLFlBSmdDO0FBS2xDLDBCQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQUE7O0FBQ2QsVUFBSUMsRUFBRSxHQUFHSixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDQyxFQUFkLENBQVQ7O0FBQ0EsVUFBSUUsS0FBSyxHQUFHTixDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDRyxLQUFkLENBQVo7O0FBQ0EsVUFBSUMsU0FBUyxHQUFHUCxDQUFDLENBQUNLLE1BQUYsQ0FBU0YsSUFBSSxDQUFDSSxTQUFkLENBQWhCOztBQUNBLFVBQUlDLFVBQVUsR0FBR1IsQ0FBQyxDQUFDSyxNQUFGLENBQVNGLElBQUksQ0FBQ0ssVUFBZCxDQUFqQjs7QUFFQSxXQUFLQyxNQUFMLEdBQWNSLENBQUMsdUNBQ0FHLEVBREEsb0tBRTBDRSxLQUYxQyw2VUFLNEVDLFNBTDVFLDRCQUtzR0osSUFBSSxDQUFDTyxLQUFOLEdBQWUsUUFBZixHQUEwQixFQUwvSCx3REFLMEtILFNBTDFLLG9JQU00RUMsVUFONUUsNEJBTXVHLENBQUNMLElBQUksQ0FBQ08sS0FBUCxHQUFnQixRQUFoQixHQUEyQixFQU5qSSx1REFNMktGLFVBTjNLLGlIQUFmO0FBWUFQLE1BQUFBLENBQUMsQ0FBQyxRQUFELEVBQVcsS0FBS1EsTUFBaEIsQ0FBRCxDQUF5QkUsRUFBekIsQ0FBNEIsT0FBNUIsRUFBcUMsVUFBQ0MsQ0FBRCxFQUFPO0FBQ3hDLFlBQUlDLE9BQU8sR0FBR1osQ0FBQyxDQUFDLGVBQUQsRUFBa0IsS0FBSSxDQUFDUSxNQUF2QixDQUFELENBQWdDSyxJQUFoQyxDQUFxQyxZQUFyQyxDQUFkO0FBQ0EsWUFBSUMsT0FBTyxHQUFHZCxDQUFDLENBQUNXLENBQUMsQ0FBQ0ksTUFBSCxDQUFELENBQVlGLElBQVosQ0FBaUIsWUFBakIsQ0FBZDs7QUFDQSxZQUFJRCxPQUFPLElBQUlFLE9BQWYsRUFBd0I7QUFDcEJkLFVBQUFBLENBQUMsQ0FBQyxlQUFELEVBQWtCLEtBQUksQ0FBQ1EsTUFBdkIsQ0FBRCxDQUFnQ1EsV0FBaEMsQ0FBNEMsUUFBNUM7QUFDQWhCLFVBQUFBLENBQUMsQ0FBQ1csQ0FBQyxDQUFDSSxNQUFILENBQUQsQ0FBWUUsUUFBWixDQUFxQixRQUFyQjs7QUFDQSxVQUFBLEtBQUksQ0FBQ1QsTUFBTCxDQUFZVSxPQUFaLENBQW9CLFFBQXBCLEVBQThCO0FBQUNULFlBQUFBLEtBQUssRUFBRVQsQ0FBQyxDQUFDLEtBQUQsQ0FBRCxDQUFRYSxJQUFSLENBQWEsWUFBYjtBQUFSLFdBQTlCO0FBQ0g7QUFDSixPQVJEOztBQVVBLFVBQUlYLElBQUksQ0FBQ2lCLElBQVQsRUFBZTtBQUNYLFlBQUlDLEtBQUssR0FBR3BCLENBQUMscUNBQTRCRSxJQUFJLENBQUNpQixJQUFqQyxZQUFiO0FBQ0EsYUFBS1gsTUFBTCxDQUFZYSxNQUFaLENBQW1CRCxLQUFuQjtBQUNIO0FBQ0o7O0FBckNpQztBQUFBO0FBQUEsYUF1Q2xDLG9CQUFXO0FBQ1AsZUFBT3BCLENBQUMsQ0FBQyxlQUFELEVBQWtCLEtBQUtRLE1BQXZCLENBQUQsQ0FBZ0NLLElBQWhDLENBQXFDLFlBQXJDLENBQVA7QUFDSDtBQXpDaUM7QUFBQTtBQUFBLGFBMkNsQyxvQkFBVztBQUNQLGVBQU8sS0FBS0wsTUFBWjtBQUNIO0FBN0NpQzs7QUFBQTtBQUFBOztBQWdEdEMsU0FBT1AsWUFBUDtBQUNILENBakRLLENBQU4iLCJzb3VyY2VzQ29udGVudCI6WyIgICAgXG5kZWZpbmUoZnVuY3Rpb24ocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG4gICAgbGV0IF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG4gICAgbGV0ICQgPSByZXF1aXJlKCdqcXVlcnknKTtcblxuICAgIGNsYXNzIEJvb2xlYW5JbnB1dCB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGRhdGEpIHtcbiAgICAgICAgICAgIGxldCBpZCA9IF8uZXNjYXBlKGRhdGEuaWQpO1xuICAgICAgICAgICAgbGV0IGxhYmVsID0gXy5lc2NhcGUoZGF0YS5sYWJlbCk7XG4gICAgICAgICAgICBsZXQgdHJ1ZUxhYmVsID0gXy5lc2NhcGUoZGF0YS50cnVlTGFiZWwpO1xuICAgICAgICAgICAgbGV0IGZhbHNlTGFiZWwgPSBfLmVzY2FwZShkYXRhLmZhbHNlTGFiZWwpO1xuXG4gICAgICAgICAgICB0aGlzLiRpbnB1dCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCIke2lkfVwiIGNsYXNzPVwiY29udHJvbC1ncm91cCBzaGFyZWQtY29udHJvbHMtY29udHJvbGdyb3VwIGNvbnRyb2wtZ3JvdXAtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb250cm9sLWxhYmVsXCIgZm9yPVwiY29udHJvbC1rZXlcIj4ke2xhYmVsfTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgcm9sZT1cImdyb3VwXCIgY2xhc3M9XCJjb250cm9scyBjb250cm9scy1qb2luXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udHJvbCBidG4tZ3JvdXAgYnRuLWdyb3VwLXJhZGlvIHNoYXJlZC1jb250cm9scy1ib29sZWFucmFkaW9jb250cm9sIGNvbnRyb2wtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIHJvbGU9XCJidXR0b25cIiBuYW1lPVwiaW5wdXRSYWRpb0Jvb2xlYW5cIiBhcmlhLWxhYmVsPVwiJHt0cnVlTGFiZWx9XCIgY2xhc3M9XCJidG4gJHsoZGF0YS52YWx1ZSkgPyAnYWN0aXZlJyA6ICcnfVwiIGRhdGEtdmFsdWU9XCIxXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIj4ke3RydWVMYWJlbH08L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiByb2xlPVwiYnV0dG9uXCIgbmFtZT1cImlucHV0UmFkaW9Cb29sZWFuXCIgYXJpYS1sYWJlbD1cIiR7ZmFsc2VMYWJlbH1cIiBjbGFzcz1cImJ0biAkeyghZGF0YS52YWx1ZSkgPyAnYWN0aXZlJyA6ICcnfVwiIGRhdGEtdmFsdWU9XCIwXCIgYXJpYS1wcmVzc2VkPVwidHJ1ZVwiPiR7ZmFsc2VMYWJlbH08L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIGApO1xuXG4gICAgICAgICAgICAkKCdidXR0b24nLCB0aGlzLiRpbnB1dCkub24oJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgY3VyclZhbCA9ICQoJ2J1dHRvbi5hY3RpdmUnLCB0aGlzLiRpbnB1dCkuYXR0cignZGF0YS12YWx1ZScpO1xuICAgICAgICAgICAgICAgIGxldCB0YXJnVmFsID0gJChlLnRhcmdldCkuYXR0cignZGF0YS12YWx1ZScpO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyVmFsICE9IHRhcmdWYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnYnV0dG9uLmFjdGl2ZScsIHRoaXMuJGlucHV0KS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgICAgICQoZS50YXJnZXQpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kaW5wdXQudHJpZ2dlcignY2hhbmdlJywge3ZhbHVlOiAkKHRoaXMpLmF0dHIoJ2RhdGEtdmFsdWUnKX0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5oZWxwKSB7XG4gICAgICAgICAgICAgICAgbGV0ICRoZWxwID0gJChgPGRpdiBjbGFzcz1cImhlbHAtYmxvY2tcIj4ke2RhdGEuaGVscH08L2Rpdj5gKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRpbnB1dC5hcHBlbmQoJGhlbHApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZ2V0VmFsdWUoKSB7XG4gICAgICAgICAgICByZXR1cm4gJCgnYnV0dG9uLmFjdGl2ZScsIHRoaXMuJGlucHV0KS5hdHRyKCdkYXRhLXZhbHVlJyk7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRJbnB1dCgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpbnB1dDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBCb29sZWFuSW5wdXQ7XG59KTsiXX0=