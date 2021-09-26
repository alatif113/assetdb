define(['/static/app/assetdb/js/prism.min.js', 'jquery'], function (Prism, $) {
	return function (str, multiline, highlight) {
		var hlight = highlight ? ' highlight' : '';
		var indentlevel = 0;
		var linePrefix = '<span class="row"><span class="gutter"></span><div class="code">';
		var lineSuffix = '</div></span>';
		var result = linePrefix + lineSuffix + linePrefix;
		var newLine = false;
		var prevTok = '';
		var pipe = false;
		var args = false;
		var line = str.replace(/[\r\n\s]+/g, ' '); //remove new lines and excessive whitespace
		var tokens = Prism.tokenize(line, Prism.languages['splunk-spl']);

		for (var i = 0; i < tokens.length; i++) {
			var content = typeof tokens[i] == 'object' ? tokens[i].content : tokens[i];
			var type = typeof tokens[i] == 'object' ? tokens[i].type : 'default';

			if (content === '|') {
				args = true;
			}
			if (content === 'eval' || content === 'search' || content === 'where') {
				args = false;
			}
			if (args && type == 'property') {
				type = 'argument';
			}

			if (multiline) {
				newLine = false;
				if (content === '|' && i != 0 && prevTok !== '[') {
					newLine = true;
				}
				if (content === '[' && i != 0) {
					indentlevel++;
					newLine = true;
				}
				if (content === ']') {
					indentlevel--;
					indentlevel = Math.max(indentlevel, 0);
				}
				if (newLine) {
					result += lineSuffix + linePrefix + '&nbsp;'.repeat(indentlevel * 4);
				}
				if (content !== ' ') {
					prevTok = content;
				}
			}

			if (type == 'default') {
				result += content;
			} else {
				result += `<span class="${type} ${hlight}">${content}</span>`;
			}
		}

		result += lineSuffix + linePrefix + lineSuffix;
		return $(result);
	};
});
