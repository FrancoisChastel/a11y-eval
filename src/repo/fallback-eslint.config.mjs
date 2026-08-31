// Bundled fallback used when the target repo has no (working) ESLint setup.
// Lints JSX/TSX with eslint-plugin-jsx-a11y recommended rules only.
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'

const base = jsxA11y.flatConfigs.recommended

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**', '**/out/**'] },
  {
    ...base,
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ...base.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    ...base,
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ...base.languageOptions,
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
]
