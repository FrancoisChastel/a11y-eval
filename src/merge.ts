import { buildRemediationPlan } from './remediations.ts'
import { computeScore, computeTotals, computeVerdict } from './scoring.ts'
import type { Finding, ManualReview, OverallVerdict, Report } from './types.ts'

const manualItemToFinding = (item: ManualReview['items'][number], fallbackPage: string): Finding[] => {
  const pages = item.pages && item.pages.length > 0 ? item.pages : [fallbackPage]
  return pages.map((page) => ({
    engine: 'human' as const,
    ruleId: `manual-${item.sc}`,
    impact: item.severity ?? 'serious',
    wcag: [item.sc],
    description: item.evidence || `Manual review failed WCAG ${item.sc}.`,
    page,
    targets: item.screenshots ?? [],
  }))
}

/**
 * Merges a manual review into a report. Pure: returns a new Report.
 * - fail items become engine:"human" findings and re-enter scoring/verdict
 * - overall: 'fail' if the recomputed verdict fails OR any manual item failed;
 *   'no-known-violations' only when every criterion is dispositioned, none failed,
 *   and nothing needs an expert; otherwise 'issues'
 * - dispositions without evidence are surfaced, never hidden
 */
export const mergeManualReview = (report: Report, manual: ManualReview): Report => {
  const fallbackPage = report.pages[0]?.url ?? 'app'
  const humanFindings = manual.items.filter((i) => i.status === 'fail').flatMap((i) => manualItemToFinding(i, fallbackPage))

  const findings = [...report.findings.filter((f) => f.engine !== 'human'), ...humanFindings]
  const totals = computeTotals(findings)
  const verdict = computeVerdict(totals)

  const dispositioned = new Set(manual.items.map((i) => i.sc))
  const allDispositioned = report.manualChecklist.every((c) => dispositioned.has(c.sc))
  const anyManualFail = manual.items.some((i) => i.status === 'fail')
  const anyNeedsExpert = manual.items.some((i) => i.status === 'needs-expert')

  let overall: OverallVerdict
  if (verdict === 'fail' || anyManualFail) overall = 'fail'
  else if (verdict === 'pass' && allDispositioned && !anyNeedsExpert) overall = 'no-known-violations'
  else overall = 'issues'

  const undocumentedDispositions = manual.items
    .filter((i) => !i.evidence?.trim() && !i.autoSuggested)
    .map((i) => i.sc)

  return {
    ...report,
    findings,
    totals,
    score: computeScore(findings),
    verdict,
    remediationPlan: buildRemediationPlan(findings),
    manualReview: manual,
    overall,
    undocumentedDispositions,
  }
}
