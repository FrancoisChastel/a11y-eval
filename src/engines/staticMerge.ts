import type { Finding } from '../types.ts'

interface EslintMessage {
  ruleId: string | null
  severity: number
  message: string
  line?: number
  column?: number
}

interface EslintFileResult {
  filePath: string
  messages?: EslintMessage[]
}

/** Rule prefixes recognized as accessibility lint rules across the major frameworks. */
const A11Y_RULE_PATTERNS = [
  /^jsx-a11y\//,
  /^vuejs-accessibility\//,
  /^@angular-eslint\/template\/(accessibility-|alt-text|elements-content|label-has|interactive-supports|click-events|mouse-events|no-autofocus|no-distracting|no-positive-tabindex|role-has|table-scope|valid-aria)/,
  /^astro\/jsx-a11y\//,
  /^svelte\/valid-aria|^svelte\/a11y/,
]

const isA11yRule = (ruleId: string | null): ruleId is string =>
  ruleId !== null && A11Y_RULE_PATTERNS.some((p) => p.test(ruleId))

/**
 * Folds an ESLint JSON report (eslint -f json) into static findings.
 * Static findings are advisory (moderate/minor): the runtime engines are the
 * source of truth for whether an issue reaches the rendered page.
 */
export const eslintReportToFindings = (report: EslintFileResult[]): Finding[] => {
  const findings: Finding[] = []
  for (const file of report) {
    for (const message of file.messages ?? []) {
      if (!isA11yRule(message.ruleId)) continue
      findings.push({
        engine: 'static',
        ruleId: message.ruleId,
        impact: message.severity === 2 ? 'moderate' : 'minor',
        wcag: [],
        description: message.message,
        page: file.filePath,
        targets: [`${file.filePath}:${message.line ?? 0}:${message.column ?? 0}`],
      })
    }
  }
  return findings
}
