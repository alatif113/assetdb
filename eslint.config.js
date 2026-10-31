const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
	{ ignores: ['**/*.min*.js', 'mockups/**', 'node_modules/**', 'lib/**', 'dist/**', '.venv/**'] },
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
	{ files: ['tests/**/*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.node, document: 'readonly', window: 'readonly' } } },
];
