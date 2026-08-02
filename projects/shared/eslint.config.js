#!/usr/bin/env node
// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  { ignores: ['projects/shared/src/**/*spec.ts', 'projects/shared/src/**/*.d.ts'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'shared', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'shared', style: 'camelCase' }]
    }
  }
);