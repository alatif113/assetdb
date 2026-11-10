'use strict';
// Expands the backtick macros of default/macros.conf in a piece of SPL, the way Splunk does (arguments by `$name$`), so tests can check
// what the generated merge search does without caring which part of it is a named macro. A definition may continue on the next line after a
// trailing backslash (as in macros.conf).
const fs = require('node:fs');
const path = require('node:path');

const CONF = path.join(__dirname, '..', '..', 'default', 'macros.conf');

function parseMacros(text = fs.readFileSync(CONF, 'utf8')) {
	const macros = {};
	let cur = null;
	for (const raw of text.replace(/\\\r?\n/g, '').split('\n')) {
		const line = raw.trim();
		const head = /^\[(.+)\]$/.exec(line);
		if (head) { cur = macros[head[1]] = { args: [], definition: '' }; continue; }
		if (!cur || !line || line.startsWith('#')) continue;
		const kv = /^(\w+)\s*=\s*(.*)$/.exec(line);
		if (!kv) continue;
		if (kv[1] === 'args') cur.args = kv[2].split(',').map((a) => a.trim()).filter(Boolean);
		else if (kv[1] === 'definition') cur.definition = kv[2];
	}
	return macros;
}

/** Split macro arguments on top level commas. */
function splitArgs(text) {
	const out = []; let depth = 0, cur = '', quote = false;
	for (const ch of text) {
		if (ch === '"') quote = !quote;
		if (!quote && ch === '(') depth++;
		if (!quote && ch === ')') depth--;
		if (!quote && depth === 0 && ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
	}
	if (cur.trim() || out.length) out.push(cur.trim());
	return out;
}

// The merge building blocks (the normalizers stay as they are: tests look for them by name).
const MERGE_STEPS = /^adb_(counters|tag_time|newest_first|map_column|key_blocklist|key_blocklist_cs|merge|save_overflow|run_guard|record_run|write_gate)$/;

/** Replace every `name(args)` / `name` in spl by its definition, repeatedly (macros may use macros). */
function expandMacros(spl, macros = parseMacros(), only = MERGE_STEPS) {
	let text = spl;
	for (let pass = 0; pass < 6; pass++) {
		const next = text.replace(/`([a-z_0-9]+)(?:\(([^`]*)\))?`/g, (all, name, argText) => {
			// Splunk removes the quotes around a quoted argument
			const args = argText === undefined ? [] : splitArgs(argText).map((x) => x.replace(/^"([\s\S]*)"$/, '$1'));
			if (only && !only.test(name)) return all;
			const m = macros[args.length ? `${name}(${args.length})` : name];
			if (!m) return all;
			return m.args.reduce((def, a, i) => def.split(`$${a}$`).join(args[i]), m.definition);
		});
		if (next === text) break;
		text = next;
	}
	return text;
}

module.exports = { parseMacros, expandMacros, splitArgs };
