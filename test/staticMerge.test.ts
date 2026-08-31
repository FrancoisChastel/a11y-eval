import { describe, expect, test } from 'vitest'
import { eslintReportToFindings } from '../src/engines/staticMerge.ts'

const eslintReport = [
  {
    filePath: '/app/src/components/Form.tsx',
    messages: [
      { ruleId: 'jsx-a11y/label-has-associated-control', severity: 2, message: 'A form label must be associated with a control.', line: 12, column: 5 },
      { ruleId: 'jsx-a11y/click-events-have-key-events', severity: 1, message: 'Visible, non-interactive elements with click handlers must have at least one keyboard listener.', line: 30, column: 3 },
      { ruleId: 'no-unused-vars', severity: 2, message: 'x is unused', line: 1, column: 1 },
    ],
  },
  {
    filePath: '/app/src/App.vue',
    messages: [
      { ruleId: 'vuejs-accessibility/alt-text', severity: 2, message: 'img elements must have an alt prop.', line: 4, column: 9 },
    ],
  },
]

describe('eslintReportToFindings', () => {
  test('keeps only accessibility rules and drops unrelated lint errors', () => {
    const findings = eslintReportToFindings(eslintReport)
    expect(findings).toHaveLength(3)
    expect(findings.map((f) => f.ruleId)).not.toContain('no-unused-vars')
  })

  test('maps eslint severity to impact (error → moderate, warn → minor)', () => {
    const findings = eslintReportToFindings(eslintReport)
    expect(findings.find((f) => f.ruleId.includes('label-has'))?.impact).toBe('moderate')
    expect(findings.find((f) => f.ruleId.includes('click-events'))?.impact).toBe('minor')
  })

  test('records engine, file path and line-based target', () => {
    const [first] = eslintReportToFindings(eslintReport)
    expect(first.engine).toBe('static')
    expect(first.page).toBe('/app/src/components/Form.tsx')
    expect(first.targets[0]).toBe('/app/src/components/Form.tsx:12:5')
  })

  test('returns empty list for empty or malformed input', () => {
    expect(eslintReportToFindings([])).toEqual([])
    expect(eslintReportToFindings([{ filePath: '/x.ts' } as never])).toEqual([])
  })
})
