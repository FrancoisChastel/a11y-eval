import type { Engine, Finding, Impact, ScoreDeduction, Verdict } from './types.ts'

/**
 * Splits findings into gating (affect score/verdict) and suspects (machine-flagged,
 * pre-fill the review UI). Under strict mode, suspects gate too.
 */
export const partitionFindings = (findings: Finding[], strict = false): { gating: Finding[]; suspects: Finding[] } => {
  if (strict) return { gating: findings, suspects: [] }
  const gating: Finding[] = []
  const suspects: Finding[] = []
  for (const f of findings) (f.confidence === 'suspect' ? suspects : gating).push(f)
  return { gating, suspects }
}

const IMPACT_WEIGHT: Record<Impact, number> = {
  critical: 15,
  serious: 10,
  moderate: 3,
  minor: 1,
}

/** Instances of the same rule on the same page counted toward the score. */
const INSTANCE_CAP = 5

/** ACT/EARL outcome for a finding: suspect → 'incomplete', otherwise 'failed'. */
export const actOutcomeFor = (f: Pick<Finding, 'confidence'>): 'failed' | 'incomplete' =>
  f.confidence === 'suspect' ? 'incomplete' : 'failed'

export const computeTotals = (findings: Finding[]): Record<Impact, number> => {
  const totals: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of findings) totals[f.impact] += 1
  return totals
}

const IMPACT_RANK: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }

/**
 * The explainable form of the score: per rule, how many instances existed, how
 * many counted (capped at 5 per rule per page so a systemic issue reads as one
 * problem, not a zero score), and the points deducted.
 */
export const computeScoreBreakdown = (findings: Finding[]): ScoreDeduction[] => {
  const perPageCounts = new Map<string, number>()
  const groups = new Map<string, ScoreDeduction>()
  for (const f of findings) {
    const groupId = `${f.engine}::${f.ruleId}`
    const group =
      groups.get(groupId) ??
      ({ ruleId: f.ruleId, engine: f.engine as Engine, impact: f.impact, instances: 0, counted: 0, deduction: 0 } satisfies ScoreDeduction)
    group.instances += 1
    if (IMPACT_RANK[f.impact] < IMPACT_RANK[group.impact]) group.impact = f.impact
    const pageKey = `${f.ruleId}::${f.page}`
    const seen = perPageCounts.get(pageKey) ?? 0
    if (seen < INSTANCE_CAP) {
      perPageCounts.set(pageKey, seen + 1)
      group.counted += 1
      group.deduction += IMPACT_WEIGHT[f.impact]
    }
    groups.set(groupId, group)
  }
  return [...groups.values()].sort((a, b) => b.deduction - a.deduction)
}

/**
 * 100 minus weighted deductions. Repeats of one rule on one page are capped so a
 * single systemic issue (e.g. contrast token) reads as one problem, not a zero score.
 */
export const computeScore = (findings: Finding[]): number =>
  Math.max(0, 100 - computeScoreBreakdown(findings).reduce((sum, d) => sum + d.deduction, 0))

/**
 * Verdict gates on severity, not score: any critical/serious automated violation is
 * an AA blocker. "pass" means no automated violations — never a compliance claim.
 */
export const computeVerdict = (totals: Record<Impact, number>): Verdict => {
  if (totals.critical > 0 || totals.serious > 0) return 'fail'
  if (totals.moderate > 0 || totals.minor > 0) return 'pass-with-issues'
  return 'pass'
}
