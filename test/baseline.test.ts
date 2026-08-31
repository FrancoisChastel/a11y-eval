import { describe, expect, test } from 'vitest'
import { diffAgainstBaseline, fingerprint } from '../src/baseline.ts'
import type { Finding } from '../src/types.ts'

const finding = (over: Partial<Finding>): Finding => ({
  engine: 'axe',
  ruleId: 'image-alt',
  impact: 'critical',
  wcag: ['1.1.1'],
  description: 'd',
  page: 'http://localhost:3000/pricing',
  targets: ['img.hero'],
  ...over,
})

describe('fingerprint', () => {
  test('ignores origin and scheme so file:// baselines match http:// runs', () => {
    const a = fingerprint(finding({ page: 'file:///srv/site/pricing' }))
    const b = fingerprint(finding({ page: 'http://localhost:8377/srv/site/pricing' }))
    expect(a).toBe(b)
  })

  test('differs by rule, target, and path', () => {
    const base = fingerprint(finding({}))
    expect(fingerprint(finding({ ruleId: 'label' }))).not.toBe(base)
    expect(fingerprint(finding({ targets: ['img.other'] }))).not.toBe(base)
    expect(fingerprint(finding({ page: 'http://localhost:3000/about' }))).not.toBe(base)
  })
})

describe('diffAgainstBaseline', () => {
  const baseline = { findings: [finding({}), finding({ ruleId: 'label', targets: ['#email'] })] }

  test('classifies persisting, new, and fixed findings', () => {
    const current = [finding({}), finding({ ruleId: 'link-name', targets: ['a.cta'] })]
    const { findings, diff } = diffAgainstBaseline(current, baseline, 'old/report.json')

    expect(findings.find((f) => f.ruleId === 'image-alt')?.baselineStatus).toBe('persisting')
    expect(findings.find((f) => f.ruleId === 'link-name')?.baselineStatus).toBe('new')
    expect(diff).toMatchObject({ newCount: 1, persistingCount: 1, fixedCount: 1 })
    expect(diff.fixed[0].ruleId).toBe('label')
  })

  test('everything fixed against a clean current run', () => {
    const { diff } = diffAgainstBaseline([], baseline, 'old/report.json')
    expect(diff.fixedCount).toBe(2)
    expect(diff.newCount).toBe(0)
  })
})
