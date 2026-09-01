// Bundled a11y ESLint config — fully self-contained (a11y-eval's own eslint,
// parsers, and plugins), so the static scan never depends on the target repo's
// lint setup. Covers JS/JSX/TS/TSX (jsx-a11y) and .vue SFCs (vuejs-accessibility).
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import vueA11y from 'eslint-plugin-vuejs-accessibility'

const base = jsxA11y.flatConfigs.recommended

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**', '**/out/**'] },
  ...vueA11y.configs['flat/recommended'],
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
