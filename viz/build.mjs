// Bundles every viz/<name>/src/visualization.js twice:
//   appserver/static/visualizations/<name>/{visualization.js,config.json,preview.png}  for Dashboard Studio (Splunk 10.4+, see default/visualizations.conf)
//   appserver/static/js/classic/<name>.min.js                                       for the classic dashboards (any Splunk), where the page puts the
//     visualization in an iframe and viz/shared/classic-host.mjs stands in for the Studio extension API.
// Run with: npm run build:viz  (--out <dir> builds both trees somewhere else, which the freshness check uses.)
import { build } from 'esbuild';
import { readdirSync, readFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf('--out');
const outBase = outArg > 0 ? process.argv[outArg + 1] : null;
const out = outBase ? join(outBase, 'visualizations') : join(root, '..', 'appserver', 'static', 'visualizations');
const classicOut = outBase ? join(outBase, 'js', 'classic') : join(root, '..', 'appserver', 'static', 'js', 'classic');

// The visualization runs in an iframe with no stylesheet of its own, so css is turned into a <style> the script adds.
const cssInject = {
	name: 'css-inject',
	setup(b) {
		b.onLoad({ filter: /\.css$/ }, (args) => ({
			contents: `const s = document.createElement('style'); s.textContent = ${JSON.stringify(readFileSync(args.path, 'utf8'))}; document.head.appendChild(s);`,
			loader: 'js',
		}));
	},
};
const names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'config.json'))).map((d) => d.name);
rmSync(classicOut, { recursive: true, force: true }); mkdirSync(classicOut, { recursive: true });
for (const name of names) {
	const dir = join(out, name);
	rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
	await build({
		entryPoints: [join(root, name, 'src', 'visualization.js')], outfile: join(dir, 'visualization.js'),
		bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true, sourcemap: false, legalComments: 'none', plugins: [cssInject],
	});
	copyFileSync(join(root, name, 'config.json'), join(dir, 'config.json'));
	if (existsSync(join(root, name, 'preview.png'))) copyFileSync(join(root, name, 'preview.png'), join(dir, 'preview.png'));
	await build({
		entryPoints: [join(root, name, 'src', 'visualization.js')], outfile: join(classicOut, name + '.min.js'),
		bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, sourcemap: false, legalComments: 'none', plugins: [cssInject],
		alias: { '@splunk/dashboard-studio-extension': join(root, 'shared', 'classic-host.mjs') },
	});
	console.log('built', name);
}
