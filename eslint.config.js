const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
	{ ignores: ['**/*.min*.js', 'node_modules/**', 'lib/**', 'dist/**', 'samples/**', '.venv/**', 'appserver/static/visualizations/**', 'appserver/static/js/classic/**'] },
	js.configs.recommended,
	{
		files: ['appserver/static/js/src/**/*.js'],
		languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, define: 'readonly', require: 'readonly' } },
		rules: { 'no-console': 'warn', eqeqeq: ['warn', 'smart'], 'no-unused-vars': 'warn' },
	},
	{
		files: ['tests/**/*.js', 'tests/**/*.mjs', 'eslint.config.js'],
		languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
	},
	// The custom visualizations: ES modules that run in a browser iframe (built into appserver/static/visualizations).
	{
		files: ['viz/**/*.js', 'viz/shared/*.mjs'],
		languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
		rules: { eqeqeq: ['warn', 'smart'], 'no-unused-vars': 'warn' },
	},
	{ files: ['viz/build.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } } },
	{ files: ['tests/**/*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.node, document: 'readonly', window: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly' } } },
];
