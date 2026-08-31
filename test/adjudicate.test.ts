import { describe, expect, test } from 'vitest'
import { buildAdjudicationPrompt, parseAdjudication } from '../src/engines/adjudicate.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from '../src/wcag.ts'
import type { Report } from '../src/types.ts'

const report = (): Report => ({
  tool: 'a11y-eval',
  version: 't',
  target: 'wcag22aa',
  startedAt: 's',
  finishedAt: 'f',
  pages: [{ url: 'http://x/', findings: [], passes: 1, incomplete: 0 }],
  findings: [
    { engine: 'keyboard', ruleId: 'focus-order-suspect', impact: 'moderate', wcag: ['2.4.3'], confidence: 'suspect', description: 'Tab jumps upward: #footer → #b', page: 'http://x/', targets: ['#b'] },
  ],
  totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  score: 100,
  verdict: 'pass',
  manualChecklist: MANUAL_CHECKLIST,
  coverageNote: COVERAGE_NOTE,
  evidence: [
    { sc: '2.4.6', kind: 'headings', items: [{ page: 'http://x/', selector: 'h1', text: 'Payments' }] },
    { sc: '3.3.2', kind: 'labels', items: [{ page: 'http://x/', selector: 'label', text: '"Date" → text name=d' }] },
  ],
})

describe('buildAdjudicationPrompt', () => {
  test('includes suspects, evidence, judging rules, and the JSON contract', () => {
    const prompt = buildAdjudicationPrompt(report())
    expect(prompt).toContain('Tab jumps upward: #footer → #b')
    expect(prompt).toContain('Payments')
    expect(prompt).toContain('"Date" → text name=d')
    expect(prompt).toContain('WCAG 2.4.6')
    expect(prompt).toContain('"needs-expert"')
    expect(prompt).toContain('prefer needs-expert over a guessed pass')
  })
})

describe('parseAdjudication', () => {
  test('parses statuses and demotes low-confidence verdicts to needs-expert', () => {
    const items = parseAdjudication(
      `Here is my assessment:\n[
        {"sc":"2.4.6","status":"pass","confidence":"high","evidence":"Headings describe sections."},
        {"sc":"3.3.2","status":"fail","confidence":"high","evidence":"Label 'Date' lacks format guidance."},
        {"sc":"2.4.3","status":"pass","confidence":"low","evidence":"Jump may be intentional."}
      ]`,
      ['2.4.6', '3.3.2', '2.4.3'],
    )
    expect(items.find((i) => i.sc === '2.4.6')?.status).toBe('pass')
    expect(items.find((i) => i.sc === '3.3.2')?.status).toBe('fail')
    expect(items.find((i) => i.sc === '2.4.3')?.status).toBe('needs-expert')
    expect(items.every((i) => i.method === 'llm')).toBe(true)
  })

  test('drops unknown criteria and invalid statuses become needs-expert', () => {
    const items = parseAdjudication(
      `[{"sc":"9.9.9","status":"pass"},{"sc":"2.4.6","status":"definitely-fine","evidence":"x"}]`,
      ['2.4.6'],
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ sc: '2.4.6', status: 'needs-expert' })
  })

  test('throws when no JSON array is present', () => {
    expect(() => parseAdjudication('I cannot do that.', ['2.4.6'])).toThrow()
  })
})
