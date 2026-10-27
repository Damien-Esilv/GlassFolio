import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.claude/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.*',
      'vitest.config.*',
      'tailwind.config.*',
      'postcss.config.*',
      'tests/**',                 // Tests have relaxed rules (can use any)
      'supabase/functions/**',    // Supabase Deno Edge Functions
      'src/services/mockData.backend.ts', // Generated seed data
    ],
  },

  // ── Base JS rules ──────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript files ───────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Promise: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLFormElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        // React
        React: 'writable',
        // Vite
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      // ── TypeScript ──────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',         // warn, not error (existing violations)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── React ───────────────────────────────────────────────────────────────
      'react/react-in-jsx-scope': 'off',                    // React 17+ JSX transform
      'react/prop-types': 'off',                            // Using TypeScript instead
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── i18n ─────────────────────────────────────────────────────────────────
      // Note: i18next/no-literal-string is intentionally omitted here due to a
      // plugin bug with jsx-components pattern matching. Use the custom
      // 'check:i18n' script (scripts/check-i18n-keys.mjs) for i18n auditing.

      // ── General quality ─────────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': 'off',     // Handled by @typescript-eslint/no-unused-vars
      'no-undef': 'off',           // Handled by TypeScript

      // ── Standards compliance ────────────────────────────────────────────────
      // R02 from AI_CODING_STANDARDS.md: no direct localStorage in components
      'no-restricted-globals': ['error', {
        name: 'localStorage',
        message: 'Do not access localStorage directly. Use src/services/ instead.',
      }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // ── Service layer exception — localStorage IS allowed in services & context ──
  {
    files: ['src/services/**/*.ts', 'src/utils/**/*.ts', 'src/context/**/*.tsx', 'src/context/**/*.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // ── Node.js scripts ────────────────────────────────────────────────────────
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'mcp-server/**/*.{js,mjs,cjs}', 'server/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // ── Test files — relaxed rules ─────────────────────────────────────────────
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-globals': 'off',
      'i18next/no-literal-string': 'off',
    },
  },
];
