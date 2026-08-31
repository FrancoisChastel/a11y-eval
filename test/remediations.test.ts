import { describe, expect, test } from 'vitest'
import { buildRemediationPlan, remediationFor } from '../src/remediations.ts'
import type { Finding } from '../src/types.ts'

const finding = (over: Partial<Finding>): Finding => ({
  engine: 'axe',
  ruleId: 'color-contrast',
  impact: 'serious',
  wcag: ['1.4.3'],
  description: 'd',
  page: 'http://x/a',
  targets: ['.x'],
  ...over,
})

describe('remediationFor', () => {
  test('covers every custom keyboard-engine rule', () => {
    for (const rule of ['keyboard-unreachable', 'focus-not-visible', 'horizontal-overflow-320']) {
      const r = remediationFor(rule)
      expect(r.summary).not.toMatch(/linked rule documentation/)
      expect(r.steps.length).toBeGreaterThan(0)
      expect(r.pitfalls.length).toBeGreaterThan(0)
    }
  })

  test('falls back to a generic entry for unknown rules', () => {
    expect(remediationFor('some-exotic-rule').summary).toMatch(/rule documentation/)
  })
})

describe('buildRemediationPlan', () => {
  test('groups findings of the same rule into one entry with count and pages', () => {
    const plan = buildRemediationPlan([
      finding({ page: 'http://x/a' }),
      finding({ page: 'http://x/b' }),
      finding({ page: 'http://x/a' }),
    ])
    expect(plan).toHaveLength(1)
    expect(plan[0].findingCount).toBe(3)
    expect(plan[0].pages).toEqual(['http://x/a', 'http://x/b'])
  })

  test('orders by impact first, then by reach', () => {
    const plan = buildRemediationPlan([
      finding({ ruleId: 'minor-rule', impact: 'minor' }),
      finding({ ruleId: 'image-alt', impact: 'critical' }),
      finding({ ruleId: 'big-serious', impact: 'serious' }),
      finding({ ruleId: 'big-serious', impact: 'serious', page: 'http://x/b' }),
      finding({ ruleId: 'small-serious', impact: 'serious' }),
    ])
    expect(plan.map((g) => g.ruleId)).toEqual(['image-alt', 'big-serious', 'small-serious', 'minor-rule'])
  })

  test('escalates group impact to the worst instance and unions wcag refs', () => {
    const plan = buildRemediationPlan([
      finding({ impact: 'moderate', wcag: ['1.4.3'] }),
      finding({ impact: 'serious', wcag: ['1.4.6'] }),
    ])
    expect(plan[0].impact).toBe('serious')
    expect(plan[0].wcag.sort()).toEqual(['1.4.3', '1.4.6'])
  })
})
