#!/usr/bin/env node
const {defineConfig} = require('eslint/config');
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {ignores: ['projects/panel/src/**/*spec.ts', 'projects/panel/src/**/*.d.ts']},
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': ['error', {type: 'element', prefix: 'panel', style: 'kebab-case'}],
      '@angular-eslint/directive-selector': ['error', {type: 'attribute', prefix: 'panel', style: 'camelCase'}]
    }
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {}
  }
]);