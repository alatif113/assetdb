define(['/static/app/assetdb/js/prism.min.js', 'jquery', 'underscore'], function (Prism, $, _) {
	function flatten(content) {
		if (Array.isArray(content)) return content.map(flatten).join('');
		if (content && typeof content == 'object') return flatten(content.content);
		return content == null ? '' : String(content);
	}

	return function (str) {
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

			newLine = false;
			if (content === '|' && i != 0 && prevTok !== '[') {
				newLine = true;
			}
			if (type == 'comment' &&  i != 0) {
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

			// Prism returns raw text (it may contain user supplied values), so escape it.
			// Nested tokens can arrive as arrays/objects; flatten them to plain text first.
			var text = _.escape(typeof content == 'string' ? content : flatten(content));
			if (type == 'default') {
				result += text;
			} else {
				result += `<span class="${_.escape(type)}">${text}</span>`;
			}
		}

		result += lineSuffix + linePrefix + lineSuffix;
		return $(result);
	};
});
