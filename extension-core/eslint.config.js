#!/usr/bin/env node
const {defineConfig} = require('eslint/config');
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const path = require('path');
const globals = require('globals');

module.exports = defineConfig([
  // TypeScript files configuration
  {
    files: ['**/*.ts'],
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      '**/*spec.ts',
      '**/*.test.ts',
      '**/*.js',
      'vendor/**',
      '**/*.json'
    ],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: path.resolve(__dirname, '..'),
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      // ESLint core rules
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'default-case': 'error',
      'default-case-last': 'error',
      'dot-notation': 'warn',
      'no-empty-function': 'warn',
      // 'no-magic-numbers': ['warn', {ignore: [-1, 0, 1, 2, 100, 1000], ignoreArrayIndexes: true}],
      'no-param-reassign': 'warn',
      'no-plusplus': ['error', {allowForLoopAfterthoughts: true}],
      'no-shadow': 'warn',
      'no-throw-literal': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'warn',

      // Browser extension specific considerations
      // Allow browser global (from webextension-polyfill)
      'no-undef': ['error', {typeof: true}],

      // Style rules
      'comma-dangle': ['error', 'always-multiline'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'indent': ['error', 2],
      'max-len': ['warn', {code: 120, ignoreStrings: true, ignoreTemplateLiterals: true}],
      'object-curly-newline': ['warn', {multiline: true, consistent: true}],
      'padded-blocks': ['error', 'never'],
      'space-before-function-paren': ['error', 'never'],
      'keyword-spacing': ['error', {before: true, after: true}],
      'key-spacing': ['error', {beforeColon: false, afterColon: true}],

      // Import rules
      'no-duplicate-imports': 'error',
    },
  },
]);
