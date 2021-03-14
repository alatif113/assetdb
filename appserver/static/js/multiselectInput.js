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
        return this.splunkInput.val();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tdWx0aXNlbGVjdElucHV0LmpzIl0sIm5hbWVzIjpbImRlZmluZSIsInJlcXVpcmUiLCJleHBvcnRzIiwibW9kdWxlIiwiXyIsIiQiLCJfTXVsdGlTZWxlY3RJbnB1dCIsIk11bHRpU2VsZWN0SW5wdXQiLCJkYXRhIiwiaWQiLCJlc2NhcGUiLCJsYWJlbCIsIiRpbnB1dCIsInNwbHVua0lucHV0IiwiZWwiLCJjaG9pY2VzIiwidmFsdWUiLCJyZW5kZXIiLCJjc3MiLCJyZW1vdmUiLCJoZWxwIiwiJGhlbHAiLCJhcHBlbmQiLCJ2YWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUFBLE1BQU0sQ0FBQyxVQUFTQyxPQUFULEVBQWtCQyxPQUFsQixFQUEyQkMsTUFBM0IsRUFBbUM7QUFDdEMsTUFBSUMsQ0FBQyxHQUFHSCxPQUFPLENBQUMsWUFBRCxDQUFmOztBQUNBLE1BQUlJLENBQUMsR0FBR0osT0FBTyxDQUFDLFFBQUQsQ0FBZjs7QUFDQSxNQUFJSyxpQkFBaUIsR0FBR0wsT0FBTyxDQUFDLDJDQUFELENBQS9COztBQUhzQyxNQUtoQ00sZ0JBTGdDO0FBT2xDLDhCQUFZQyxJQUFaLEVBQWtCO0FBQUE7O0FBQ2QsVUFBSUMsRUFBRSxHQUFHTCxDQUFDLENBQUNNLE1BQUYsQ0FBU0YsSUFBSSxDQUFDQyxFQUFkLENBQVQ7O0FBQ0EsVUFBSUUsS0FBSyxHQUFHUCxDQUFDLENBQUNNLE1BQUYsQ0FBU0YsSUFBSSxDQUFDRyxLQUFkLENBQVo7O0FBRUEsV0FBS0MsTUFBTCxHQUFjUCxDQUFDLHVDQUNBSSxFQURBLG9LQUUwQ0UsS0FGMUMsb05BQWY7QUFTQSxXQUFLRixFQUFMLEdBQVVELElBQUksQ0FBQ0MsRUFBZjtBQUVBLFdBQUtJLFdBQUwsR0FBbUIsSUFBSVAsaUJBQUosQ0FBc0I7QUFDckNHLFFBQUFBLEVBQUUsRUFBRUQsSUFBSSxDQUFDQyxFQUQ0QjtBQUVyQ0ssUUFBQUEsRUFBRSxFQUFFVCxDQUFDLENBQUMsVUFBRCxFQUFhLEtBQUtPLE1BQWxCLENBRmdDO0FBR3JDRyxRQUFBQSxPQUFPLEVBQUVQLElBQUksQ0FBQ08sT0FIdUI7QUFJckNDLFFBQUFBLEtBQUssRUFBRVIsSUFBSSxDQUFDUTtBQUp5QixPQUF0QixFQUtoQkMsTUFMZ0IsRUFBbkI7QUFPQVosTUFBQUEsQ0FBQyxDQUFDLHVCQUFELEVBQTBCLEtBQUtPLE1BQS9CLENBQUQsQ0FBd0NNLEdBQXhDLENBQTRDLFFBQTVDLEVBQXNELENBQXREO0FBQ0FiLE1BQUFBLENBQUMsQ0FBQyxtQ0FBRCxFQUFzQyxLQUFLTyxNQUEzQyxDQUFELENBQW9ETSxHQUFwRCxDQUF3RCxPQUF4RCxFQUFpRSxNQUFqRTtBQUNBYixNQUFBQSxDQUFDLENBQUMsOEJBQUQsRUFBaUMsS0FBS08sTUFBdEMsQ0FBRCxDQUErQ08sTUFBL0M7O0FBRUEsVUFBSVgsSUFBSSxDQUFDWSxJQUFULEVBQWU7QUFDWCxZQUFJQyxLQUFLLEdBQUdoQixDQUFDLHFDQUE0QkcsSUFBSSxDQUFDWSxJQUFqQyxZQUFiO0FBQ0EsYUFBS1IsTUFBTCxDQUFZVSxNQUFaLENBQW1CRCxLQUFuQjtBQUNIO0FBQ0o7O0FBckNpQztBQUFBO0FBQUEsYUF1Q2xDLG9CQUFXO0FBQ1AsZUFBTyxLQUFLUixXQUFMLENBQWlCVSxHQUFqQixFQUFQO0FBQ0g7QUF6Q2lDO0FBQUE7QUFBQSxhQTJDbEMsb0JBQVc7QUFDUCxlQUFPLEtBQUtYLE1BQVo7QUFDSDtBQTdDaUM7QUFBQTtBQUFBLGFBK0NsQyxpQkFBUTtBQUNKLGVBQU8sS0FBS0gsRUFBWjtBQUNIO0FBakRpQzs7QUFBQTtBQUFBOztBQW9EdEMsU0FBT0YsZ0JBQVA7QUFDSCxDQXJESyxDQUFOIiwic291cmNlc0NvbnRlbnQiOlsiZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuICAgIGxldCBfID0gcmVxdWlyZSgndW5kZXJzY29yZScpO1xuICAgIGxldCAkID0gcmVxdWlyZSgnanF1ZXJ5Jyk7XG4gICAgbGV0IF9NdWx0aVNlbGVjdElucHV0ID0gcmVxdWlyZSgnc3BsdW5ranMvbXZjL3NpbXBsZWZvcm0vaW5wdXQvbXVsdGlzZWxlY3QnKTtcbiAgICBcbiAgICBjbGFzcyBNdWx0aVNlbGVjdElucHV0IHtcblxuICAgICAgICBjb25zdHJ1Y3RvcihkYXRhKSB7XG4gICAgICAgICAgICBsZXQgaWQgPSBfLmVzY2FwZShkYXRhLmlkKTtcbiAgICAgICAgICAgIGxldCBsYWJlbCA9IF8uZXNjYXBlKGRhdGEubGFiZWwpO1xuXG4gICAgICAgICAgICB0aGlzLiRpbnB1dCA9ICQoYFxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCIke2lkfVwiIGNsYXNzPVwiY29udHJvbC1ncm91cCBzaGFyZWQtY29udHJvbHMtY29udHJvbGdyb3VwIGNvbnRyb2wtZ3JvdXAtZGVmYXVsdFwiPlxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJjb250cm9sLWxhYmVsXCIgZm9yPVwiY29udHJvbC1rZXlcIj4ke2xhYmVsfTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgcm9sZT1cImdyb3VwXCIgY2xhc3M9XCJjb250cm9scyBjb250cm9scy1qb2luXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udHJvbCBjb250cm9sLWRlZmF1bHRcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgdGhpcy5pZCA9IGRhdGEuaWQ7XG5cbiAgICAgICAgICAgIHRoaXMuc3BsdW5rSW5wdXQgPSBuZXcgX011bHRpU2VsZWN0SW5wdXQoe1xuICAgICAgICAgICAgICAgIGlkOiBkYXRhLmlkLFxuICAgICAgICAgICAgICAgIGVsOiAkKCcuY29udHJvbCcsIHRoaXMuJGlucHV0KSxcbiAgICAgICAgICAgICAgICBjaG9pY2VzOiBkYXRhLmNob2ljZXMsXG4gICAgICAgICAgICAgICAgdmFsdWU6IGRhdGEudmFsdWVcbiAgICAgICAgICAgIH0pLnJlbmRlcigpO1xuXG4gICAgICAgICAgICAkKCcuc3BsdW5rLW11bHRpZHJvcGRvd24nLCB0aGlzLiRpbnB1dCkuY3NzKCdtYXJnaW4nLCAwKTtcbiAgICAgICAgICAgICQoJy5zcGx1bmstbXVsdGlkcm9wZG93biA+IGRpdiA+IGRpdicsIHRoaXMuJGlucHV0KS5jc3MoJ3dpZHRoJywgJzEwMCUnKTtcbiAgICAgICAgICAgICQoJy5zcGx1bmstY2hvaWNlLWlucHV0LW1lc3NhZ2UnLCB0aGlzLiRpbnB1dCkucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLmhlbHApIHtcbiAgICAgICAgICAgICAgICBsZXQgJGhlbHAgPSAkKGA8ZGl2IGNsYXNzPVwiaGVscC1ibG9ja1wiPiR7ZGF0YS5oZWxwfTwvZGl2PmApO1xuICAgICAgICAgICAgICAgIHRoaXMuJGlucHV0LmFwcGVuZCgkaGVscCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBnZXRWYWx1ZSgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNwbHVua0lucHV0LnZhbCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0SW5wdXQoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5wdXQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRJZCgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIE11bHRpU2VsZWN0SW5wdXQ7XG59KTsiXX0=