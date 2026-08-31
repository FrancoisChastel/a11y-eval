import type { ContentSignals, Finding, Report } from './types.ts'

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const

const sortedFindings = (findings: Finding[]): Finding[] =>
  [...findings].sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact))

const cell = (value: string): string => value.replace(/\|/g, '\\|').replaceAll('\n', ' ')

/** Ten-segment visual score bar, e.g. ██████░░░░ for 55. */
export const scoreBar = (score: number): string => {
  const filled = Math.round(Math.max(0, Math.min(100, score)) / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

const SIGNAL_LABELS: Record<keyof ContentSignals, string> = {
  media: 'Media',
  forms: 'Form controls',
  drag: 'Drag affordances',
  hoverContent: 'Hover/focus content',
  langParts: 'Foreign-language parts',
  iframes: 'Iframes',
}

const atAGlance = (report: Report): string[] => {
  const engines = new Set(report.findings.map((f) => f.engine))
  const enginesRan = ['axe', 'keyboard', ...(report.meta?.staticScan && report.meta.staticScan !== 'none' ? [`static (${report.meta.staticScan})`] : [])]
  const manualState = !report.manualReview
    ? 'not started — open review.html or run the a11y-evaluator skill'
    : report.manualChecklist.every((c) => report.manualReview?.items.some((i) => i.sc === c.sc))
      ? `complete (${report.manualReview.items.length} criteria)`
      : `incomplete (${report.manualReview.items.length}/${report.manualChecklist.length} criteria)`
  const rows: [string, string][] = [
    ['Result', report.overall ? `${report.overall} (automated verdict: ${report.verdict})` : report.verdict],
    ['Score', `${report.score}/100 (progress metric — gate on verdict, not score)`],
    ['Pages', `${report.pages.length}${report.meta?.crawled ? ` (crawled from ${report.meta.seeds?.length ?? 1} seed(s))` : ''}`],
    ['Engines', enginesRan.join(' · ') + (engines.has('human') ? ' · human review' : '') + (engines.has('agent') ? ' · agent review' : '')],
    ['Fix groups', `${(report.remediationPlan ?? []).length} — full agent work order in mitigations.md`],
    ['Manual review', manualState],
  ]
  if (report.baselineDiff) {
    rows.splice(3, 0, ['Versus baseline', `${report.baselineDiff.newCount} new · ${report.baselineDiff.persistingCount} persisting · ${report.baselineDiff.fixedCount} fixed`])
  }
  return [`| | |`, `|---|---|`, ...rows.map(([k, v]) => `| **${k}** | ${cell(v)} |`), '']
}

const signalsSummary = (report: Report): string[] => {
  const pagesWithSignals = report.pages.filter((p) => p.signals)
  if (pagesWithSignals.length === 0) return []
  const totals = {} as Record<keyof ContentSignals, number>
  for (const key of Object.keys(SIGNAL_LABELS) as (keyof ContentSignals)[]) {
    totals[key] = pagesWithSignals.reduce((sum, p) => sum + (p.signals?.[key] ?? 0), 0)
  }
  return [
    `## Content signals`,
    '',
    `Detected content types gate which manual criteria apply (zero across all pages → justified N/A).`,
    '',
    `| Signal | Total | Pages with occurrences |`,
    `|---|---|---|`,
    ...(Object.keys(SIGNAL_LABELS) as (keyof ContentSignals)[]).map((key) => {
      const pages = pagesWithSignals.filter((p) => (p.signals?.[key] ?? 0) > 0).map((p) => p.url)
      return `| ${SIGNAL_LABELS[key]} | ${totals[key]} | ${cell(pages.join(', ') || '—')} |`
    }),
    '',
  ]
}

const gaps = (report: Report): string[] => {
  const items: string[] = []
  if (!report.meta?.staticScan || report.meta.staticScan === 'none') {
    items.push('No static source scan ran (URL mode) — source-level issues on unrendered components are invisible to this report.')
  } else if (report.meta.staticScan === 'skipped') {
    items.push(`Static scan was skipped: ${report.meta.staticScanNote ?? 'no note recorded'}.`)
  }
  const incompleteTotal = report.pages.reduce((sum, p) => sum + p.incomplete, 0)
  if (incompleteTotal > 0) {
    const affected = report.pages.filter((p) => p.incomplete > 0).map((p) => `${p.url} (${p.incomplete})`)
    items.push(`axe marked ${incompleteTotal} check(s) as needing human confirmation: ${affected.join(', ')}.`)
  }
  if (!report.manualReview) {
    items.push('The manual half of the evaluation has not been done — the 16 checklist criteria below are unverified.')
  } else {
    const missing = report.manualChecklist.filter((c) => !report.manualReview?.items.some((i) => i.sc === c.sc))
    if (missing.length > 0) items.push(`Manual criteria not yet dispositioned: ${missing.map((c) => c.sc).join(', ')}.`)
    if (report.undocumentedDispositions && report.undocumentedDispositions.length > 0) {
      items.push(`Dispositions recorded without evidence: ${report.undocumentedDispositions.join(', ')}.`)
    }
    const experts = report.manualReview.items.filter((i) => i.status === 'needs-expert')
    if (experts.length > 0) items.push(`Deferred to a human specialist: ${experts.map((i) => i.sc).join(', ')}.`)
  }
  if (report.meta?.crawled) {
    items.push('Only crawl-reachable pages were evaluated — SPA-only routes, auth-gated pages, and form-flow steps need explicit --url seeds.')
  }
  return [`## Gaps — what this report does NOT cover`, '', ...items.map((i) => `- ${i}`), '']
}

const nextSteps = (report: Report): string[] => {
  const steps: string[] = []
  if (!report.manualReview) {
    steps.push(
      'Complete the manual review: open `review.html` (static) or serve it with `a11y-eval review --report <this dir>` (autosave + evidence screenshots), then `a11y-eval merge --report <this dir> --manual manual-review.json`.',
    )
  }
  if ((report.remediationPlan ?? []).length > 0 || report.manualReview?.items.some((i) => i.status === 'fail')) {
    steps.push('Execute fixes from `mitigations.md` (the agent work order), one group per change-set.')
    steps.push(`Verify each batch by re-running with \`--baseline <this dir>/report.json\` — fixed findings are tracked, regressions surface as new.`)
  }
  if (steps.length === 0) steps.push('No automated findings and the manual review is merged — archive this report as the baseline for future runs.')
  return [`## Next steps`, '', ...steps.map((s, i) => `${i + 1}. ${s}`), '']
}

export const renderMarkdown = (report: Report): string => {
  const headline = report.overall
    ? `**Overall: ${report.overall.toUpperCase().replaceAll('-', ' ')}** (automated verdict: ${report.verdict})`
    : `**Verdict: ${report.verdict.toUpperCase()}**`
  const lines: string[] = [
    `# Accessibility Evaluation — WCAG 2.2 AA`,
    '',
    `${headline} · Score: ${report.score}/100 · ${report.findings.length} finding(s) across ${report.pages.length} page(s)`,
    '',
    ...atAGlance(report),
    `| Critical | Serious | Moderate | Minor |`,
    `|---|---|---|---|`,
    `| ${report.totals.critical} | ${report.totals.serious} | ${report.totals.moderate} | ${report.totals.minor} |`,
    '',
    `> ${report.coverageNote}`,
    '',
  ]

  if (report.scoreBreakdown && report.scoreBreakdown.length > 0) {
    const totalDeducted = report.scoreBreakdown.reduce((sum, d) => sum + d.deduction, 0)
    lines.push(
      `## Score breakdown`,
      '',
      `${scoreBar(report.score)} **${report.score}/100** — starts at 100; deductions weighted by impact (critical −15, serious −10, moderate −3, minor −1), capped at 5 counted instances per rule per page so one systemic issue reads as one problem.`,
      '',
      `| Rule | Engine | Impact | Instances (counted) | Points |`,
      `|---|---|---|---|---|`,
      ...report.scoreBreakdown.map(
        (d) => `| ${d.ruleId} | ${d.engine} | ${d.impact} | ${d.instances}${d.counted < d.instances ? ` (${d.counted} counted)` : ''} | −${d.deduction} |`,
      ),
      `| **Total** | | | | **−${Math.min(100, totalDeducted)}** |`,
      '',
    )
  }

  if (report.baselineDiff && report.baselineDiff.fixed.length > 0) {
    lines.push(`## Fixed since baseline`, '', ...report.baselineDiff.fixed.map((f) => `- ${f.ruleId} on ${f.page} (\`${f.target}\`)`), '')
  }

  if (report.remediationPlan && report.remediationPlan.length > 0) {
    lines.push(
      `## Top fixes`,
      '',
      `Ordered by impact, then reach. Per-instance details, examples, and pitfalls are in **mitigations.md**.`,
      '',
      ...report.remediationPlan.slice(0, 5).map(
        (g, i) => `${i + 1}. **[${g.impact}] ${g.ruleId}** — ${g.findingCount} finding(s) on ${g.pages.length} page(s) · ${g.recommendation.summary} _(effort: ${g.recommendation.effort})_`,
      ),
      ...(report.remediationPlan.length > 5 ? [`${report.remediationPlan.length - 5} more group(s) in mitigations.md.`] : []),
      '',
    )
  }

  lines.push(`## Findings by page`, '')
  for (const page of report.pages) {
    const pageScore = page.score !== undefined ? `score ${page.score}/100 · ` : ''
    lines.push(`### ${page.url}`, '', `${pageScore}${page.findings.length} finding(s) · ${page.passes} axe rules passed · ${page.incomplete} incomplete (need review)`, '')
    if (page.findings.length > 0) {
      lines.push(`| Impact | Rule | WCAG | Target | Description |`, `|---|---|---|---|---|`)
      for (const f of sortedFindings(page.findings)) {
        const impact = f.baselineStatus ? `${f.impact} (${f.baselineStatus})` : f.impact
        lines.push(`| ${impact} | ${f.ruleId} | ${f.wcag.join(', ') || '—'} | \`${cell(f.targets[0] ?? '')}\` | ${cell(f.description)} |`)
      }
      lines.push('')
    }
  }

  const staticFindings = report.findings.filter((f) => f.engine === 'static')
  if (staticFindings.length > 0) {
    lines.push(`## Static analysis findings`, '', `| Impact | Rule | Location | Description |`, `|---|---|---|---|`)
    for (const f of sortedFindings(staticFindings)) {
      lines.push(`| ${f.impact} | ${f.ruleId} | \`${cell(f.targets[0] ?? '')}\` | ${cell(f.description)} |`)
    }
    lines.push('')
  }

  lines.push(...signalsSummary(report))

  if (report.manualReview) {
    lines.push(`## Manual review`, '')
    const env = report.manualReview.environment
    const context = [
      report.manualReview.reviewer?.name ? `Reviewer: ${report.manualReview.reviewer.name}` : null,
      env?.browser ? `Browser: ${env.browser}` : null,
      env?.os ? `OS: ${env.os}` : null,
      env?.assistiveTech ? `Assistive tech: ${env.assistiveTech}` : null,
    ].filter(Boolean)
    if (context.length > 0) lines.push(context.join(' · '), '')
    lines.push(`| SC | Status | Method | Evidence |`, `|---|---|---|---|`)
    for (const item of report.manualReview.items) {
      lines.push(`| ${item.sc} | ${item.status}${item.autoSuggested ? ' (auto-suggested)' : ''} | ${item.method ?? '—'} | ${cell(item.evidence ?? '') || '—'} |`)
    }
    lines.push('')
  } else {
    lines.push(
      `## Manual review required (automation blind spots)`,
      '',
      `| SC | Name | Why automation cannot verify |`,
      `|---|---|---|`,
      ...report.manualChecklist.map((i) => `| ${i.sc} | ${i.name} | ${i.why} |`),
      '',
    )
  }

  lines.push(...gaps(report))
  lines.push(...nextSteps(report))

  return lines.join('\n')
}
