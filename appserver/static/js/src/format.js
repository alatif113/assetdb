// Renders the generated merge search (an array of {kind, text} lines from makeMergeSearchLines) as
// numbered, highlighted rows. Lines are typed by the generator, so nothing is parsed here beyond
// colouring the tokens of one command line, and all text is inserted with .text(), never as HTML.
define(['jquery'], function ($) {
	// One alternation, tried in order at each position.
	var TOKEN = /(?<string>"(?:\\.|[^\\"])*")|(?<macro>`[^`]*`)|(?<function>\w+(?=\())|(?<word>\b(?:as|by|AND|OR|NOT|IN)\b)|(?<arg>\w+(?==))/g;

	/**
	 * Split one line into [{type, text}] pieces. Concatenating the text gives the line back.
	 * Types: comment, operator, keyword, string, function, operator-word, argument, default.
	 */
	function tokenize(line) {
		var tokens = [];
		var push = function (type, text) {
			if (text === '') return;
			var last = tokens[tokens.length - 1];
			if (last && last.type === type && type === 'default') last.text += text;
			else tokens.push({ type: type, text: text });
		};

		if (line.kind === 'comment') {
			push('comment', line.text);
			return tokens;
		}

		var text = line.text;
		var rest = text;
		var isEval = false;
		var m = /^(\|\s*)(`[^`]*`|\w+)/.exec(text);
		if (m) {
			push('operator', m[1].replace(/\s+$/, ''));
			push('default', m[1].slice(m[1].replace(/\s+$/, '').length));
			push('keyword', m[2]);
			isEval = m[2] === 'eval' || m[2] === 'search' || m[2] === 'where';
			rest = text.slice(m[0].length);
		}

		var pos = 0;
		TOKEN.lastIndex = 0;
		var t;
		while ((t = TOKEN.exec(rest)) !== null) {
			push('default', rest.slice(pos, t.index));
			var g = t.groups;
			if (g.string !== undefined) push('string', t[0]);
			else if (g.macro !== undefined) push('keyword', t[0]);
			else if (g.function !== undefined) push('function', t[0]);
			else if (g.word !== undefined) push('operator-word', t[0]);
			else push(isEval ? 'default' : 'argument', t[0]);
			pos = t.index + t[0].length;
		}
		push('default', rest.slice(pos));
		return tokens;
	}

	function row(text) {
		var $code = $('<div class="code"></div>');
		return { $row: $('<span class="row"></span>').append('<span class="gutter"></span>').append($code), $code: $code, text: text };
	}

	function format(lines) {
		var $root = $('<div></div>');
		var rows = [row()].concat(
			lines.map(function (line) {
				var r = row();
				tokenize(line).forEach(function (token) {
					if (token.type === 'default') r.$code.append(document.createTextNode(token.text));
					else r.$code.append($('<span></span>').addClass(token.type).text(token.text));
				});
				return r;
			}),
			[row()]
		);
		rows.forEach(function (r) {
			$root.append(r.$row);
		});
		return $root.children();
	}

	format.tokenize = tokenize;
	return format;
});
