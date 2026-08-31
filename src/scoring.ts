import type { Finding, Impact, Verdict } from './types.ts'

const IMPACT_WEIGHT: Record<Impact, number> = {
  critical: 15,
  serious: 10,
  moderate: 3,
  minor: 1,
}

/** Instances of the same rule on the same page counted toward the score. */
const INSTANCE_CAP = 5

export const computeTotals = (findings: Finding[]): Record<Impact, number> => {
  const totals: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of findings) totals[f.impact] += 1
  return totals
}

/**
 * 100 minus weighted deductions. Repeats of one rule on one page are capped so a
 * single systemic issue (e.g. contrast token) reads as one problem, not a zero score.
 */
export const computeScore = (findings: Finding[]): number => {
  const instanceCounts = new Map<string, number>()
  let deduction = 0
  for (const f of findings) {
    const key = `${f.ruleId}::${f.page}`
    const seen = instanceCounts.get(key) ?? 0
    if (seen >= INSTANCE_CAP) continue
    instanceCounts.set(key, seen + 1)
    deduction += IMPACT_WEIGHT[f.impact]
  }
  return Math.max(0, 100 - deduction)
}

/**
 * Verdict gates on severity, not score: any critical/serious automated violation is
 * an AA blocker. "pass" means no automated violations — never a compliance claim.
 */
export const computeVerdict = (totals: Record<Impact, number>): Verdict => {
  if (totals.critical > 0 || totals.serious > 0) return 'fail'
  if (totals.moderate > 0 || totals.minor > 0) return 'pass-with-issues'
  return 'pass'
}
