import type { BaselineDiff, Finding, Report } from './types.ts'

/**
 * Fingerprints ignore the URL origin/scheme so a file:// run can baseline an
 * http://localhost run of the same pages: what identifies a finding is the rule,
 * the page path, and the first target.
 */
export const fingerprint = (f: Pick<Finding, 'engine' | 'ruleId' | 'page' | 'targets'>): string => {
  let path = f.page
  try {
    path = new URL(f.page).pathname
  } catch {
    /* static findings carry file paths — use as-is */
  }
  return `${f.engine}::${f.ruleId}::${path}::${f.targets[0] ?? ''}`
}

/**
 * Classifies current findings as new/persisting against a baseline report and
 * lists baseline findings that no longer occur (fixed). Mutates nothing.
 */
export const diffAgainstBaseline = (
  current: Finding[],
  baseline: Pick<Report, 'findings'>,
  baselinePath: string,
): { findings: Finding[]; diff: BaselineDiff } => {
  const baselinePrints = new Map<string, Finding>()
  for (const f of baseline.findings) baselinePrints.set(fingerprint(f), f)

  const currentPrints = new Set<string>()
  const findings = current.map((f) => {
    const print = fingerprint(f)
    currentPrints.add(print)
    return { ...f, baselineStatus: baselinePrints.has(print) ? ('persisting' as const) : ('new' as const) }
  })

  const fixed = [...baselinePrints.entries()]
    .filter(([print]) => !currentPrints.has(print))
    .map(([, f]) => ({ ruleId: f.ruleId, page: f.page, target: f.targets[0] ?? '' }))

  return {
    findings,
    diff: {
      baselinePath,
      newCount: findings.filter((f) => f.baselineStatus === 'new').length,
      persistingCount: findings.filter((f) => f.baselineStatus === 'persisting').length,
      fixedCount: fixed.length,
      fixed,
    },
  }
}
