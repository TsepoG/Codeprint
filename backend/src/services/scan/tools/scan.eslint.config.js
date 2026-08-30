/**
 * ESLint flat config used ONLY to scan cloned third-party repos.
 *
 * This is deliberately loaded via `--config` (see `../tools/eslint.js`) so
 * ESLint never picks up the target repo's own eslint.config.js - a cloned
 * repo could otherwise ship a config that loads arbitrary plugins and
 * executes code as part of "linting". See README security notes.
 */
import js from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.git/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
