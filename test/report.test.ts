import { describe, expect, test } from 'vitest'
import { renderMarkdown } from '../src/report.ts'
import type { Report } from '../src/types.ts'

const report: Report = {
  tool: 'a11y-eval',
  version: '0.1.0',
  target: 'wcag22aa',
  startedAt: '2026-08-31T00:00:00.000Z',
  finishedAt: '2026-08-31T00:00:05.000Z',
  pages: [
    {
      url: 'file:///form.html',
      findings: [
        { engine: 'axe', ruleId: 'color-contrast', impact: 'serious', wcag: ['1.4.3'], description: 'Low contrast', page: 'file:///form.html', targets: ['.btn'] },
        { engine: 'keyboard', ruleId: 'keyboard-unreachable', impact: 'serious', wcag: ['2.1.1'], description: 'Not focusable', page: 'file:///form.html', targets: ['div.btn'] },
      ],
      passes: 20,
      incomplete: 1,
    },
  ],
  findings: [
    { engine: 'axe', ruleId: 'color-contrast', impact: 'serious', wcag: ['1.4.3'], description: 'Low contrast', page: 'file:///form.html', targets: ['.btn'] },
    { engine: 'keyboard', ruleId: 'keyboard-unreachable', impact: 'serious', wcag: ['2.1.1'], description: 'Not focusable', page: 'file:///form.html', targets: ['div.btn'] },
    { engine: 'static', ruleId: 'jsx-a11y/alt-text', impact: 'moderate', wcag: [], description: 'Missing alt', page: '/src/App.tsx', targets: ['/src/App.tsx:4:2'] },
  ],
  totals: { critical: 0, serious: 2, moderate: 1, minor: 0 },
  score: 77,
  verdict: 'fail',
  manualChecklist: [{ sc: '2.4.3', name: 'Focus Order', why: 'Order meaningfulness needs judgment.', how: 'Tab through and compare to reading order.', signal: null }],
  coverageNote: 'coverage note',
}

describe('renderMarkdown', () => {
  test('includes verdict, score, totals, findings, static section, and manual checklist', () => {
    const md = renderMarkdown(report)
    expect(md).toContain('**Verdict: FAIL**')
    expect(md).toContain('Score: 77/100')
    expect(md).toContain('| 0 | 2 | 1 | 0 |')
    expect(md).toContain('color-contrast')
    expect(md).toContain('2.1.1')
    expect(md).toContain('## Static analysis findings')
    expect(md).toContain('jsx-a11y/alt-text')
    expect(md).toContain('## Manual review required')
    expect(md).toContain('2.4.3')
    expect(md).toContain('coverage note')
  })

  test('escapes pipe characters so markdown tables stay intact', () => {
    const withPipe: Report = {
      ...report,
      pages: [
        {
          ...report.pages[0],
          findings: [{ engine: 'axe', ruleId: 'r', impact: 'minor', wcag: [], description: 'a | b', page: 'p', targets: ['x | y'] }],
        },
      ],
      findings: [],
    }
    const md = renderMarkdown(withPipe)
    expect(md).toContain('a \\| b')
    expect(md).toContain('x \\| y')
  })
})
