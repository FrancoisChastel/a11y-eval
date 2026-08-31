import { describe, expect, test } from 'vitest'
import { mergeManualReview } from '../src/merge.ts'
import { renderMitigations } from '../src/mitigations.ts'
import { buildRemediationPlan } from '../src/remediations.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from '../src/wcag.ts'
import type { Finding, Report } from '../src/types.ts'

const findings: Finding[] = [
  { engine: 'axe', ruleId: 'image-alt', impact: 'critical', wcag: ['1.1.1'], description: 'Images must have alternative text', helpUrl: 'https://deque.example/image-alt', page: 'http://x/a', targets: ['img.hero'], html: '<img src="hero.png">' },
  { engine: 'keyboard', ruleId: 'keyboard-unreachable', impact: 'serious', wcag: ['2.1.1'], description: 'Not focusable', page: 'http://x/a', targets: ['div.cta'], html: '<div class="cta">Go</div>' },
  { engine: 'static', ruleId: 'jsx-a11y/alt-text', impact: 'moderate', wcag: [], description: 'img needs alt', page: '/app/src/App.tsx', targets: ['/app/src/App.tsx:5:5'] },
]

const report = (over: Partial<Report> = {}): Report => ({
  tool: 'a11y-eval',
  version: 't',
  target: 'wcag22aa',
  startedAt: 's',
  finishedAt: 'f',
  meta: { command: 'node src/cli.ts --url http://x/a', seeds: ['http://x/a'] },
  pages: [{ url: 'http://x/a', findings: findings.slice(0, 2), passes: 5, incomplete: 0 }],
  findings,
  totals: { critical: 1, serious: 1, moderate: 1, minor: 0 },
  score: 72,
  verdict: 'fail',
  manualChecklist: MANUAL_CHECKLIST,
  coverageNote: COVERAGE_NOTE,
  remediationPlan: buildRemediationPlan(findings),
  ...over,
})

describe('renderMitigations', () => {
  test('renders one group per rule with every instance, snippet, and source location', () => {
    const md = renderMitigations(report())
    expect(md).toContain('Group 1 of 3 — [critical] `image-alt`')
    expect(md).toContain('`img.hero` on http://x/a')
    expect(md).toContain('<img src="hero.png">')
    expect(md).toContain('source `/app/src/App.tsx:5:5`')
    expect(md).toContain('https://deque.example/image-alt')
  })

  test('carries the catalog guidance: steps, before/after, and binding Do NOT pitfalls', () => {
    const md = renderMitigations(report())
    expect(md).toContain('**Do NOT:**')
    expect(md).toContain('tabindex')
    expect(md).toContain('<!-- WRONG -->')
    expect(md).toContain('<!-- RIGHT -->')
  })

  test('verification quotes the original command with --baseline', () => {
    const md = renderMitigations(report())
    expect(md).toContain('node src/cli.ts --url http://x/a --baseline')
    expect(md).toContain('never "WCAG compliant"')
  })

  test('merged manual failures get evidence-driven sections, not catalog fallbacks', () => {
    const merged = mergeManualReview(report(), {
      items: [
        { sc: '2.4.3', status: 'fail', evidence: 'Tab order jumps to footer mid-form', pages: ['http://x/a'], severity: 'serious' },
        { sc: '1.4.13', status: 'needs-expert', evidence: 'complex tooltip system' },
      ],
    })
    const md = renderMitigations(merged)
    expect(md).toContain('## Manual review failures')
    expect(md).toContain('WCAG 2.4.3 — manual review failure [serious]')
    expect(md).toContain('Tab order jumps to footer mid-form')
    expect(md).toContain('## Requires a human specialist')
    expect(md).toContain('1.4.13')
    // human findings must not appear as catalog groups
    expect(md).not.toContain('`manual-2.4.3`')
  })

  test('clean report renders a nothing-to-fix notice', () => {
    const clean = report({ findings: [], remediationPlan: [], totals: { critical: 0, serious: 0, moderate: 0, minor: 0 }, verdict: 'pass' })
    expect(renderMitigations(clean)).toContain('Nothing to fix')
  })
})
