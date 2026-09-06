import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['coverage'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Lets `const { fieldToOmit, ...rest } = obj` read naturally - the
      // tests use this to build a "legacy" result missing one field
      // (see tests/db/index.test.js) without a fake reference to the
      // destructured name just to satisfy the linter.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
]