/* PrismJS 1.17.1
https://prismjs.com/download.html#themes=prism&languages=splunk-spl */
define(function () {
	var _self = 'undefined' != typeof window ? window : 'undefined' != typeof WorkerGlobalScope && self instanceof WorkerGlobalScope ? self : {},
		Prism = (function (u) {
			var c = /\blang(?:uage)?-([\w-]+)\b/i,
				r = 0;
			var _ = {
				manual: u.Prism && u.Prism.manual,
				disableWorkerMessageHandler: u.Prism && u.Prism.disableWorkerMessageHandler,
				util: {
					encode: function (e) {
						return e instanceof L
							? new L(e.type, _.util.encode(e.content), e.alias)
							: Array.isArray(e)
							? e.map(_.util.encode)
							: e
									.replace(/&/g, '&amp;')
									.replace(/</g, '&lt;')
									.replace(/\u00a0/g, ' ');
					},
					type: function (e) {
						return Object.prototype.toString.call(e).slice(8, -1);
					},
					objId: function (e) {
						return (
							e.__id ||
								Object.defineProperty(e, '__id', {
									value: ++r,
								}),
							e.__id
						);
					},
					clone: function n(e, t) {
						var a,
							r,
							i = _.util.type(e);
						switch (((t = t || {}), i)) {
							case 'Object':
								if (((r = _.util.objId(e)), t[r])) return t[r];
								for (var o in ((a = {}), (t[r] = a), e)) e.hasOwnProperty(o) && (a[o] = n(e[o], t));
								return a;
							case 'Array':
								return (
									(r = _.util.objId(e)),
									t[r]
										? t[r]
										: ((a = []),
										  (t[r] = a),
										  e.forEach(function (e, r) {
												a[r] = n(e, t);
										  }),
										  a)
								);
							default:
								return e;
						}
					},
					currentScript: function () {
						if ('undefined' == typeof document) return null;
						if ('currentScript' in document) return document.currentScript;
						try {
							throw new Error();
						} catch (e) {
							var r = (/at [^(\r\n]*\((.*):.+:.+\)$/i.exec(e.stack) || [])[1];
							if (r) {
								var n = document.getElementsByTagName('script');
								for (var t in n) if (n[t].src == r) return n[t];
							}
							return null;
						}
					},
				},
				languages: {
					extend: function (e, r) {
						var n = _.util.clone(_.languages[e]);
						for (var t in r) n[t] = r[t];
						return n;
					},
					insertBefore: function (n, e, r, t) {
						var a = (t = t || _.languages)[n],
							i = {};
						for (var o in a)
							if (a.hasOwnProperty(o)) {
								if (o == e) for (var l in r) r.hasOwnProperty(l) && (i[l] = r[l]);
								r.hasOwnProperty(o) || (i[o] = a[o]);
							}
						var s = t[n];
						return (
							(t[n] = i),
							_.languages.DFS(_.languages, function (e, r) {
								r === s && e != n && (this[e] = i);
							}),
							i
						);
					},
					DFS: function e(r, n, t, a) {
						a = a || {};
						var i = _.util.objId;
						for (var o in r)
							if (r.hasOwnProperty(o)) {
								n.call(r, o, r[o], t || o);
								var l = r[o],
									s = _.util.type(l);
								'Object' !== s || a[i(l)]
									? 'Array' !== s || a[i(l)] || ((a[i(l)] = !0), e(l, n, o, a))
									: ((a[i(l)] = !0), e(l, n, null, a));
							}
					},
				},
				plugins: {},
				highlightAll: function (e, r) {
					_.highlightAllUnder(document, e, r);
				},
				highlightAllUnder: function (e, r, n) {
					var t = {
						callback: n,
						selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code',
					};
					_.hooks.run('before-highlightall', t);
					for (var a, i = e.querySelectorAll(t.selector), o = 0; (a = i[o++]); ) _.highlightElement(a, !0 === r, t.callback);
				},
				highlightElement: function (e, r, n) {
					var t = (function (e) {
							for (; e && !c.test(e.className); ) e = e.parentNode;
							return e ? (e.className.match(c) || [, 'none'])[1].toLowerCase() : 'none';
						})(e),
						a = _.languages[t];
					e.className = e.className.replace(c, '').replace(/\s+/g, ' ') + ' language-' + t;
					var i = e.parentNode;
					i && 'pre' === i.nodeName.toLowerCase() && (i.className = i.className.replace(c, '').replace(/\s+/g, ' ') + ' language-' + t);
					var o = {
						element: e,
						language: t,
						grammar: a,
						code: e.textContent,
					};

					function l(e) {
						(o.highlightedCode = e),
							_.hooks.run('before-insert', o),
							(o.element.innerHTML = o.highlightedCode),
							_.hooks.run('after-highlight', o),
							_.hooks.run('complete', o),
							n && n.call(o.element);
					}
					if ((_.hooks.run('before-sanity-check', o), !o.code)) return _.hooks.run('complete', o), void (n && n.call(o.element));
					if ((_.hooks.run('before-highlight', o), o.grammar))
						if (r && u.Worker) {
							var s = new Worker(_.filename);
							(s.onmessage = function (e) {
								l(e.data);
							}),
								s.postMessage(
									JSON.stringify({
										language: o.language,
										code: o.code,
										immediateClose: !0,
									})
								);
						} else l(_.highlight(o.code, o.grammar, o.language));
					else l(_.util.encode(o.code));
				},
				highlight: function (e, r, n) {
					var t = {
						code: e,
						grammar: r,
						language: n,
					};
					return (
						_.hooks.run('before-tokenize', t),
						(t.tokens = _.tokenize(t.code, t.grammar)),
						_.hooks.run('after-tokenize', t),
						L.stringify(_.util.encode(t.tokens), t.language)
					);
				},
				matchGrammar: function (e, r, n, t, a, i, o) {
					for (var l in n)
						if (n.hasOwnProperty(l) && n[l]) {
							var s = n[l];
							s = Array.isArray(s) ? s : [s];
							for (var u = 0; u < s.length; ++u) {
								if (o && o == l + ',' + u) return;
								var c = s[u],
									g = c.inside,
									f = !!c.lookbehind,
									d = !!c.greedy,
									h = 0,
									m = c.alias;
								if (d && !c.pattern.global) {
									var p = c.pattern.toString().match(/[imsuy]*$/)[0];
									c.pattern = RegExp(c.pattern.source, p + 'g');
								}
								c = c.pattern || c;
								for (var y = t, v = a; y < r.length; v += r[y].length, ++y) {
									var k = r[y];
									if (r.length > e.length) return;
									if (!(k instanceof L)) {
										if (d && y != r.length - 1) {
											if (((c.lastIndex = v), !(O = c.exec(e)))) break;
											for (
												var b = O.index + (f && O[1] ? O[1].length : 0),
													w = O.index + O[0].length,
													A = y,
													P = v,
													x = r.length;
												A < x && (P < w || (!r[A].type && !r[A - 1].greedy));
												++A
											)
												(P += r[A].length) <= b && (++y, (v = P));
											if (r[y] instanceof L) continue;
											(S = A - y), (k = e.slice(v, P)), (O.index -= v);
										} else {
											c.lastIndex = 0;
											var O = c.exec(k),
												S = 1;
										}
										if (O) {
											f && (h = O[1] ? O[1].length : 0);
											w = (b = O.index + h) + (O = O[0].slice(h)).length;
											var j = k.slice(0, b),
												N = k.slice(w),
												E = [y, S];
											j && (++y, (v += j.length), E.push(j));
											var C = new L(l, g ? _.tokenize(O, g) : O, m, O, d);
											if (
												(E.push(C),
												N && E.push(N),
												Array.prototype.splice.apply(r, E),
												1 != S && _.matchGrammar(e, r, n, y, v, !0, l + ',' + u),
												i)
											)
												break;
										} else if (i) break;
									}
								}
							}
						}
				},
				tokenize: function (e, r) {
					var n = [e],
						t = r.rest;
					if (t) {
						for (var a in t) r[a] = t[a];
						delete r.rest;
					}
					return _.matchGrammar(e, n, r, 0, 0, !1), n;
				},
				hooks: {
					all: {},
					add: function (e, r) {
						var n = _.hooks.all;
						(n[e] = n[e] || []), n[e].push(r);
					},
					run: function (e, r) {
						var n = _.hooks.all[e];
						if (n && n.length) for (var t, a = 0; (t = n[a++]); ) t(r);
					},
				},
				Token: L,
			};

			function L(e, r, n, t, a) {
				(this.type = e), (this.content = r), (this.alias = n), (this.length = 0 | (t || '').length), (this.greedy = !!a);
			}
			if (
				((u.Prism = _),
				(L.stringify = function (e, r) {
					if ('string' == typeof e) return e;
					if (Array.isArray(e))
						return e
							.map(function (e) {
								return L.stringify(e, r);
							})
							.join('');
					var n = {
						type: e.type,
						content: L.stringify(e.content, r),
						tag: 'span',
						classes: ['token', e.type],
						attributes: {},
						language: r,
					};
					if (e.alias) {
						var t = Array.isArray(e.alias) ? e.alias : [e.alias];
						Array.prototype.push.apply(n.classes, t);
					}
					_.hooks.run('wrap', n);
					var a = Object.keys(n.attributes)
						.map(function (e) {
							return e + '="' + (n.attributes[e] || '').replace(/"/g, '&quot;') + '"';
						})
						.join(' ');
					return '<' + n.tag + ' class="' + n.classes.join(' ') + '"' + (a ? ' ' + a : '') + '>' + n.content + '</' + n.tag + '>';
				}),
				!u.document)
			)
				return (
					u.addEventListener &&
						(_.disableWorkerMessageHandler ||
							u.addEventListener(
								'message',
								function (e) {
									var r = JSON.parse(e.data),
										n = r.language,
										t = r.code,
										a = r.immediateClose;
									u.postMessage(_.highlight(t, _.languages[n], n)), a && u.close();
								},
								!1
							)),
					_
				);
			var e = _.util.currentScript();
			if ((e && ((_.filename = e.src), e.hasAttribute('data-manual') && (_.manual = !0)), !_.manual)) {
				function n() {
					_.manual || _.highlightAll();
				}
				var t = document.readyState;
				'loading' === t || ('interactive' === t && e && e.defer)
					? document.addEventListener('DOMContentLoaded', n)
					: window.requestAnimationFrame
					? window.requestAnimationFrame(n)
					: window.setTimeout(n, 16);
			}
			return _;
		})(_self);
	'undefined' != typeof module && module.exports && (module.exports = Prism), 'undefined' != typeof global && (global.Prism = Prism);
	Prism.languages['splunk-spl'] = {
		comment: /```.*?```/,
		string: {
			pattern: /"(?:\\.|[^\\"])*"/,
			greedy: !0,
		},
		keyword: /\b(?:abstract|accum|addcoltotals|addinfo|addtotals|analyzefields|anomalies|anomalousvalue|anomalydetection|append|appendcols|appendcsv|appendlookup|appendpipe|arules|associate|audit|autoregress|bin|bucket|bucketdir|chart|cluster|cofilter|collect|concurrency|contingency|convert|correlate|datamodel|dbinspect|dedup|delete|delta|diff|erex|eval|eventcount|eventstats|extract|fieldformat|fields|fieldsummary|filldown|fillnull|findtypes|folderize|foreach|format|from|gauge|gentimes|geom|geomfilter|geostats|head|highlight|history|iconify|input|inputcsv|inputlookup|iplocation|join|kmeans|kv|kvform|loadjob|localize|localop|lookup|makecontinuous|makemv|makeresults|map|mcollect|metadata|metasearch|meventcollect|mstats|multikv|multisearch|mvcombine|mvexpand|nomv|outlier|outputcsv|outputlookup|outputtext|overlap|pivot|predict|rangemap|rare|regex|relevancy|reltime|rename|replace|rest|return|reverse|rex|rtorder|run|savedsearch|script|scrub|search|searchtxn|selfjoin|sendemail|set|setfields|sichart|sirare|sistats|sitimechart|sitop|sort|spath|stats|strcat|streamstats|table|tags|tail|timechart|timewrap|top|transaction|transpose|trendline|tscollect|tstats|typeahead|typelearner|typer|union|uniq|untable|where|x11|xmlkv|xmlunescape|xpath|xyseries)\b/i,
		'operator-word': {
			pattern: /\b(?:and|as|by|not|or|xor)\b/i,
			alias: 'operator',
		},
		function: /\w+(?=\()/,
		property: /\w+(?=\s*=(?!=))/,
		date: {
			pattern: /\b\d{1,2}\/\d{1,2}\/\d{1,4}(?:(?::\d{1,2}){3})?\b/,
			alias: 'number',
		},
		number: /\b\d+(?:\.\d+)?\b/,
		boolean: /\b(?:f|false|t|true)\b/i,
		operator: /[<>=]=?|[-+*/%|]/,
		punctuation: /[()[\],]/,
	};
	return Prism;
});
