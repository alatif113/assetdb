"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

define(function (require, exports, module) {
  var _ = require('underscore');

  var $ = require('jquery');

  var _MultiSelectInput = require('splunkjs/mvc/simpleform/input/multiselect');

  var MultiSelectInput = /*#__PURE__*/function () {
    function MultiSelectInput(data) {
      _classCallCheck(this, MultiSelectInput);

      var id = _.escape(data.id);

      var label = _.escape(data.label);

      this.$input = $("\n                <div id=\"".concat(id, "\" class=\"control-group shared-controls-controlgroup control-group-default\">\n                    <label class=\"control-label\" for=\"control-key\">").concat(label, "</label>\n                    <div role=\"group\" class=\"controls controls-join\">\n                        <div class=\"control control-default\"></div>\n                    </div>\n                </div>"));
      this.id = data.id;
      this.splunkInput = new _MultiSelectInput({
        id: data.id,
        el: $('.control', this.$input),
        choices: data.choices,
        value: data.value
      }).render();
      $('.splunk-multidropdown', this.$input).css('margin', 0);
      $('.splunk-multidropdown > div > div', this.$input).css('width', '100%');
      $('.splunk-choice-input-message', this.$input).remove();

      if (data.help) {
        var $help = $("<div class=\"help-block\">".concat(data.help, "</div>"));
        this.$input.append($help);
      }
    }

    _createClass(MultiSelectInput, [{
      key: "getValue",
      value: function getValue() {
        return this.splunkInput.val().join(',');
      }
    }, {
      key: "getInput",
      value: function getInput() {
        return this.$input;
      }
    }, {
      key: "getId",
      value: function getId() {
        return this.id;
      }
    }]);

    return MultiSelectInput;
  }();

  return MultiSelectInput;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tdWx0aXNlbGVjdElucHV0LmpzIl0sIm5hbWVzIjpbImRlZmluZSIsInJlcXVpcmUiLCJleHBvcnRzIiwibW9kdWxlIiwiXyIsIiQiLCJfTXVsdGlTZWxlY3RJbnB1dCIsIk11bHRpU2VsZWN0SW5wdXQiLCJkYXRhIiwiaWQiLCJlc2NhcGUiLCJsYWJlbCIsIiRpbnB1dCIsInNwbHVua0lucHV0IiwiZWwiLCJjaG9pY2VzIiwidmFsdWUiLCJyZW5kZXIiLCJjc3MiLCJyZW1vdmUiLCJoZWxwIiwiJGhlbHAiLCJhcHBlbmQiLCJ2YWwiLCJqb2luIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBQSxNQUFNLENBQUMsVUFBVUMsT0FBVixFQUFtQkMsT0FBbkIsRUFBNEJDLE1BQTVCLEVBQW9DO0FBQzFDLE1BQUlDLENBQUMsR0FBR0gsT0FBTyxDQUFDLFlBQUQsQ0FBZjs7QUFDQSxNQUFJSSxDQUFDLEdBQUdKLE9BQU8sQ0FBQyxRQUFELENBQWY7O0FBQ0EsTUFBSUssaUJBQWlCLEdBQUdMLE9BQU8sQ0FBQywyQ0FBRCxDQUEvQjs7QUFIMEMsTUFLcENNLGdCQUxvQztBQU16Qyw4QkFBWUMsSUFBWixFQUFrQjtBQUFBOztBQUNqQixVQUFJQyxFQUFFLEdBQUdMLENBQUMsQ0FBQ00sTUFBRixDQUFTRixJQUFJLENBQUNDLEVBQWQsQ0FBVDs7QUFDQSxVQUFJRSxLQUFLLEdBQUdQLENBQUMsQ0FBQ00sTUFBRixDQUFTRixJQUFJLENBQUNHLEtBQWQsQ0FBWjs7QUFFQSxXQUFLQyxNQUFMLEdBQWNQLENBQUMsdUNBQ1NJLEVBRFQsb0tBRW1ERSxLQUZuRCxvTkFBZjtBQVFBLFdBQUtGLEVBQUwsR0FBVUQsSUFBSSxDQUFDQyxFQUFmO0FBRUEsV0FBS0ksV0FBTCxHQUFtQixJQUFJUCxpQkFBSixDQUFzQjtBQUN4Q0csUUFBQUEsRUFBRSxFQUFFRCxJQUFJLENBQUNDLEVBRCtCO0FBRXhDSyxRQUFBQSxFQUFFLEVBQUVULENBQUMsQ0FBQyxVQUFELEVBQWEsS0FBS08sTUFBbEIsQ0FGbUM7QUFHeENHLFFBQUFBLE9BQU8sRUFBRVAsSUFBSSxDQUFDTyxPQUgwQjtBQUl4Q0MsUUFBQUEsS0FBSyxFQUFFUixJQUFJLENBQUNRO0FBSjRCLE9BQXRCLEVBS2hCQyxNQUxnQixFQUFuQjtBQU9BWixNQUFBQSxDQUFDLENBQUMsdUJBQUQsRUFBMEIsS0FBS08sTUFBL0IsQ0FBRCxDQUF3Q00sR0FBeEMsQ0FBNEMsUUFBNUMsRUFBc0QsQ0FBdEQ7QUFDQWIsTUFBQUEsQ0FBQyxDQUFDLG1DQUFELEVBQXNDLEtBQUtPLE1BQTNDLENBQUQsQ0FBb0RNLEdBQXBELENBQXdELE9BQXhELEVBQWlFLE1BQWpFO0FBQ0FiLE1BQUFBLENBQUMsQ0FBQyw4QkFBRCxFQUFpQyxLQUFLTyxNQUF0QyxDQUFELENBQStDTyxNQUEvQzs7QUFFQSxVQUFJWCxJQUFJLENBQUNZLElBQVQsRUFBZTtBQUNkLFlBQUlDLEtBQUssR0FBR2hCLENBQUMscUNBQTRCRyxJQUFJLENBQUNZLElBQWpDLFlBQWI7QUFDQSxhQUFLUixNQUFMLENBQVlVLE1BQVosQ0FBbUJELEtBQW5CO0FBQ0E7QUFDRDs7QUFuQ3dDO0FBQUE7QUFBQSxhQXFDekMsb0JBQVc7QUFDVixlQUFPLEtBQUtSLFdBQUwsQ0FBaUJVLEdBQWpCLEdBQXVCQyxJQUF2QixDQUE0QixHQUE1QixDQUFQO0FBQ0E7QUF2Q3dDO0FBQUE7QUFBQSxhQXlDekMsb0JBQVc7QUFDVixlQUFPLEtBQUtaLE1BQVo7QUFDQTtBQTNDd0M7QUFBQTtBQUFBLGFBNkN6QyxpQkFBUTtBQUNQLGVBQU8sS0FBS0gsRUFBWjtBQUNBO0FBL0N3Qzs7QUFBQTtBQUFBOztBQWtEMUMsU0FBT0YsZ0JBQVA7QUFDQSxDQW5ESyxDQUFOIiwic291cmNlc0NvbnRlbnQiOlsiZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblx0bGV0IF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG5cdGxldCAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG5cdGxldCBfTXVsdGlTZWxlY3RJbnB1dCA9IHJlcXVpcmUoJ3NwbHVua2pzL212Yy9zaW1wbGVmb3JtL2lucHV0L211bHRpc2VsZWN0Jyk7XG5cblx0Y2xhc3MgTXVsdGlTZWxlY3RJbnB1dCB7XG5cdFx0Y29uc3RydWN0b3IoZGF0YSkge1xuXHRcdFx0bGV0IGlkID0gXy5lc2NhcGUoZGF0YS5pZCk7XG5cdFx0XHRsZXQgbGFiZWwgPSBfLmVzY2FwZShkYXRhLmxhYmVsKTtcblxuXHRcdFx0dGhpcy4kaW5wdXQgPSAkKGBcbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiJHtpZH1cIiBjbGFzcz1cImNvbnRyb2wtZ3JvdXAgc2hhcmVkLWNvbnRyb2xzLWNvbnRyb2xncm91cCBjb250cm9sLWdyb3VwLWRlZmF1bHRcIj5cbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29udHJvbC1sYWJlbFwiIGZvcj1cImNvbnRyb2wta2V5XCI+JHtsYWJlbH08L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHJvbGU9XCJncm91cFwiIGNsYXNzPVwiY29udHJvbHMgY29udHJvbHMtam9pblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRyb2wgY29udHJvbC1kZWZhdWx0XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PmApO1xuXG5cdFx0XHR0aGlzLmlkID0gZGF0YS5pZDtcblxuXHRcdFx0dGhpcy5zcGx1bmtJbnB1dCA9IG5ldyBfTXVsdGlTZWxlY3RJbnB1dCh7XG5cdFx0XHRcdGlkOiBkYXRhLmlkLFxuXHRcdFx0XHRlbDogJCgnLmNvbnRyb2wnLCB0aGlzLiRpbnB1dCksXG5cdFx0XHRcdGNob2ljZXM6IGRhdGEuY2hvaWNlcyxcblx0XHRcdFx0dmFsdWU6IGRhdGEudmFsdWUsXG5cdFx0XHR9KS5yZW5kZXIoKTtcblxuXHRcdFx0JCgnLnNwbHVuay1tdWx0aWRyb3Bkb3duJywgdGhpcy4kaW5wdXQpLmNzcygnbWFyZ2luJywgMCk7XG5cdFx0XHQkKCcuc3BsdW5rLW11bHRpZHJvcGRvd24gPiBkaXYgPiBkaXYnLCB0aGlzLiRpbnB1dCkuY3NzKCd3aWR0aCcsICcxMDAlJyk7XG5cdFx0XHQkKCcuc3BsdW5rLWNob2ljZS1pbnB1dC1tZXNzYWdlJywgdGhpcy4kaW5wdXQpLnJlbW92ZSgpO1xuXG5cdFx0XHRpZiAoZGF0YS5oZWxwKSB7XG5cdFx0XHRcdGxldCAkaGVscCA9ICQoYDxkaXYgY2xhc3M9XCJoZWxwLWJsb2NrXCI+JHtkYXRhLmhlbHB9PC9kaXY+YCk7XG5cdFx0XHRcdHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Z2V0VmFsdWUoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zcGx1bmtJbnB1dC52YWwoKS5qb2luKCcsJyk7XG5cdFx0fVxuXG5cdFx0Z2V0SW5wdXQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy4kaW5wdXQ7XG5cdFx0fVxuXG5cdFx0Z2V0SWQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pZDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gTXVsdGlTZWxlY3RJbnB1dDtcbn0pO1xuIl19