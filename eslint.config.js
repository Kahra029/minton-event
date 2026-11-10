import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/.wrangler',
    'test-results',
    'playwright-report',
    '.orca',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // ルーター定義・テストヘルパーはコンポーネント以外も export する
    files: ['apps/web/src/app/router.tsx', 'apps/web/src/test/**', 'apps/web/src/**/*.test.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  // apps/api の 3 層構成（decisions C21）: application → usecase ← datasource
  {
    files: ['apps/api/src/usecase/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['hono', 'hono/*', 'drizzle-orm', 'drizzle-orm/*', 'cloudflare:*', 'ulid'],
              message: 'usecase は Hono / Drizzle / Workers などの実装に依存しない。port を定義して datasource で実装する',
            },
            {
              group: ['**/application', '**/application/**', '**/datasource', '**/datasource/**', '**/composition'],
              message: 'usecase から application / datasource / composition を import しない（依存の向き: application → usecase ← datasource）',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/*', '**/datasource', '**/datasource/**', '**/composition'],
              message: 'application は datasource に依存しない。usecase を c.var.usecases から使う',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/datasource/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['hono', 'hono/*', '**/application', '**/application/**', '**/composition'],
              message: 'datasource は application / Hono に依存しない（usecase の port を実装する）',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}', 'playwright.config.ts', 'e2e/**/*.ts', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
]);
