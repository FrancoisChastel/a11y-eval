import { describe, expect, test } from 'vitest'
import { mergeManualReview } from '../src/merge.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from '../src/wcag.ts'
import type { ManualReview, Report } from '../src/types.ts'

const cleanReport = (): Report => ({
  tool: 'a11y-eval',
  version: 't',
  target: 'wcag22aa',
  startedAt: 's',
  finishedAt: 'f',
  pages: [{ url: 'http://x/', findings: [], passes: 10, incomplete: 0 }],
  findings: [],
  totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  score: 100,
  verdict: 'pass',
  manualChecklist: MANUAL_CHECKLIST,
  coverageNote: COVERAGE_NOTE,
})

const fullReview = (overrides: Partial<ManualReview['items'][number]> = {}): ManualReview => ({
  items: MANUAL_CHECKLIST.map((c) => ({ sc: c.sc, status: 'pass' as const, evidence: 'checked', ...overrides })),
})

describe('mergeManualReview', () => {
  test('all criteria pass with evidence → no-known-violations', () => {
    const merged = mergeManualReview(cleanReport(), fullReview())
    expect(merged.overall).toBe('no-known-violations')
    expect(merged.undocumentedDispositions).toEqual([])
  })

  test('a manual fail elevates overall to fail and becomes a human finding', () => {
    const review = fullReview()
    review.items[0] = { sc: review.items[0].sc, status: 'fail', evidence: 'video without captions', pages: ['http://x/docs'] }
    const merged = mergeManualReview(cleanReport(), review)

    expect(merged.overall).toBe('fail')
    const human = merged.findings.find((f) => f.engine === 'human')
    expect(human).toMatchObject({ impact: 'serious', page: 'http://x/docs', wcag: [review.items[0].sc] })
    expect(merged.totals.serious).toBe(1)
    expect(merged.score).toBeLessThan(100)
  })

  test('incomplete review or needs-expert → issues, not no-known-violations', () => {
    const partial: ManualReview = { items: [{ sc: '1.2.2', status: 'pass', evidence: 'no media' }] }
    expect(mergeManualReview(cleanReport(), partial).overall).toBe('issues')

    const expert = fullReview()
    expert.items[3] = { sc: expert.items[3].sc, status: 'needs-expert', evidence: 'complex chart' }
    expect(mergeManualReview(cleanReport(), expert).overall).toBe('issues')
  })

  test('dispositions without evidence are surfaced unless auto-suggested', () => {
    const review = fullReview({ evidence: undefined })
    review.items[0].autoSuggested = true
    const merged = mergeManualReview(cleanReport(), review)
    expect(merged.undocumentedDispositions).toHaveLength(MANUAL_CHECKLIST.length - 1)
    expect(merged.undocumentedDispositions).not.toContain(review.items[0].sc)
  })

  test('re-merging replaces prior human findings instead of stacking them', () => {
    const review = fullReview()
    review.items[0] = { sc: review.items[0].sc, status: 'fail', evidence: 'x' }
    const once = mergeManualReview(cleanReport(), review)
    const twice = mergeManualReview(once, review)
    expect(twice.findings.filter((f) => f.engine === 'human')).toHaveLength(1)
  })
})
