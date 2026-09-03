import { describe, expect, test } from 'vitest'
import { actOutcomeFor, computeScore, computeScoreBreakdown, computeTotals, computeVerdict } from '../src/scoring.ts'
import type { Finding } from '../src/types.ts'

const finding = (impact: Finding['impact'], ruleId = 'r', page = 'p'): Finding => ({
  engine: 'axe',
  ruleId,
  impact,
  wcag: ['1.4.3'],
  description: 'd',
  page,
  targets: ['#x'],
})

describe('computeTotals', () => {
  test('counts findings per impact level', () => {
    // Arrange
    const findings = [finding('critical'), finding('serious'), finding('serious'), finding('minor')]

    // Act
    const totals = computeTotals(findings)

    // Assert
    expect(totals).toEqual({ critical: 1, serious: 2, moderate: 0, minor: 1 })
  })
})

describe('computeScore', () => {
  test('returns 100 for no findings', () => {
    expect(computeScore([])).toBe(100)
  })

  test('deducts more for critical than for minor findings', () => {
    const critical = computeScore([finding('critical')])
    const minor = computeScore([finding('minor')])
    expect(critical).toBeLessThan(minor)
    expect(minor).toBeLessThan(100)
  })

  test('caps repeated instances of the same rule on the same page', () => {
    // 100 instances of one rule must not zero the score on their own
    const repeated = Array.from({ length: 100 }, () => finding('serious', 'color-contrast'))
    const capped = computeScore(repeated)
    const five = computeScore(Array.from({ length: 5 }, () => finding('serious', 'color-contrast')))
    expect(capped).toBe(five)
    expect(capped).toBeGreaterThan(0)
  })

  test('never goes below 0', () => {
    const many = Array.from({ length: 50 }, (_, i) => finding('critical', `rule-${i}`))
    expect(computeScore(many)).toBe(0)
  })
})

describe('computeScoreBreakdown', () => {
  test('explains the score: per-rule instances, cap, and deduction sum to 100 - score', () => {
    const findings = [
      ...Array.from({ length: 7 }, () => finding('serious', 'color-contrast')),
      finding('critical', 'image-alt'),
      finding('minor', 'region'),
    ]
    const breakdown = computeScoreBreakdown(findings)
    const contrast = breakdown.find((d) => d.ruleId === 'color-contrast')
    expect(contrast).toMatchObject({ instances: 7, counted: 5, deduction: 50 })
    const totalDeducted = breakdown.reduce((sum, d) => sum + d.deduction, 0)
    expect(computeScore(findings)).toBe(Math.max(0, 100 - totalDeducted))
  })

  test('orders deductions largest first and caps per page, not globally', () => {
    const findings = [
      finding('serious', 'contrast', 'page-a'),
      ...Array.from({ length: 6 }, () => finding('serious', 'contrast', 'page-b')),
      finding('minor', 'region', 'page-a'),
    ]
    const breakdown = computeScoreBreakdown(findings)
    expect(breakdown[0].ruleId).toBe('contrast')
    // 1 on page-a + capped 5 on page-b = 6 counted
    expect(breakdown[0].counted).toBe(6)
  })
})

describe('computeVerdict', () => {
  test('pass when there are no findings', () => {
    expect(computeVerdict({ critical: 0, serious: 0, moderate: 0, minor: 0 })).toBe('pass')
  })

  test('fail on any critical or serious finding', () => {
    expect(computeVerdict({ critical: 1, serious: 0, moderate: 0, minor: 0 })).toBe('fail')
    expect(computeVerdict({ critical: 0, serious: 1, moderate: 0, minor: 0 })).toBe('fail')
  })

  test('pass-with-issues when only moderate or minor findings exist', () => {
    expect(computeVerdict({ critical: 0, serious: 0, moderate: 2, minor: 0 })).toBe('pass-with-issues')
    expect(computeVerdict({ critical: 0, serious: 0, moderate: 0, minor: 3 })).toBe('pass-with-issues')
  })
})

describe('actOutcomeFor (ACT/EARL vocabulary)', () => {
  test('suspects are incomplete, everything else failed', () => {
    expect(actOutcomeFor({ confidence: 'suspect' })).toBe('incomplete')
    expect(actOutcomeFor({ confidence: 'violation' })).toBe('failed')
    expect(actOutcomeFor({})).toBe('failed')
  })
})
