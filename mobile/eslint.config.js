// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'playwright-report/*', 'test-results/*'],
  },
  {
    rules: {
      // Dialogs reset their fields when they open and lists sync filters from the route; same as the web app,
      // this React Compiler hint is reported as a warning rather than an error.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
