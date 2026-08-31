import type { Finding, Report } from './types.ts'

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const

const sortedFindings = (findings: Finding[]): Finding[] =>
  [...findings].sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact))

export const renderMarkdown = (report: Report): string => {
  const headline = report.overall
    ? `**Overall: ${report.overall.toUpperCase().replaceAll('-', ' ')}** (automated verdict: ${report.verdict})`
    : `**Verdict: ${report.verdict.toUpperCase()}**`
  const lines: string[] = [
    `# Accessibility Evaluation — WCAG 2.2 AA`,
    '',
    `${headline} · Score: ${report.score}/100 · ${report.findings.length} finding(s) across ${report.pages.length} page(s)`,
    '',
    `| Critical | Serious | Moderate | Minor |`,
    `|---|---|---|---|`,
    `| ${report.totals.critical} | ${report.totals.serious} | ${report.totals.moderate} | ${report.totals.minor} |`,
    '',
    `> ${report.coverageNote}`,
    '',
  ]

  if (report.baselineDiff) {
    const d = report.baselineDiff
    lines.push(
      `**Versus baseline** (${d.baselinePath}): ${d.newCount} new · ${d.persistingCount} persisting · ${d.fixedCount} fixed`,
      '',
    )
    if (d.fixed.length > 0) {
      lines.push(...d.fixed.map((f) => `- Fixed: ${f.ruleId} on ${f.page} (\`${f.target}\`)`), '')
    }
  }

  for (const page of report.pages) {
    lines.push(`## ${page.url}`, '', `${page.findings.length} finding(s) · ${page.passes} axe rules passed · ${page.incomplete} incomplete (need review)`, '')
    if (page.findings.length > 0) {
      lines.push(`| Impact | Rule | WCAG | Target | Description |`, `|---|---|---|---|---|`)
      for (const f of sortedFindings(page.findings)) {
        const target = f.targets[0]?.replace(/\|/g, '\\|') ?? ''
        lines.push(`| ${f.impact} | ${f.ruleId} | ${f.wcag.join(', ') || '—'} | \`${target}\` | ${f.description.replace(/\|/g, '\\|')} |`)
      }
      lines.push('')
    }
  }

  const staticFindings = report.findings.filter((f) => f.engine === 'static')
  if (staticFindings.length > 0) {
    lines.push(`## Static analysis findings`, '', `| Impact | Rule | Location | Description |`, `|---|---|---|---|`)
    for (const f of sortedFindings(staticFindings)) {
      lines.push(`| ${f.impact} | ${f.ruleId} | \`${f.targets[0] ?? ''}\` | ${f.description.replace(/\|/g, '\\|')} |`)
    }
    lines.push('')
  }

  if (report.remediationPlan && report.remediationPlan.length > 0) {
    lines.push(`## Recommended fixes (grouped by root cause, in order)`, '')
    for (const [index, group] of report.remediationPlan.entries()) {
      const r = group.recommendation
      lines.push(
        `${index + 1}. **[${group.impact}] ${group.ruleId}** — ${group.findingCount} finding(s) on ${group.pages.length} page(s) · effort: ${r.effort}`,
        `   ${r.summary}`,
        ...r.steps.map((s) => `   - ${s}`),
        ...r.pitfalls.map((p) => `   - Pitfall: ${p}`),
      )
    }
    lines.push('')
  }

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
      const evidence = (item.evidence ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
      lines.push(`| ${item.sc} | ${item.status}${item.autoSuggested ? ' (auto-suggested)' : ''} | ${item.method ?? '—'} | ${evidence || '—'} |`)
    }
    lines.push('')
    if (report.undocumentedDispositions && report.undocumentedDispositions.length > 0) {
      lines.push(`**Undocumented dispositions** (status recorded without evidence): ${report.undocumentedDispositions.join(', ')}`, '')
    }
    const missing = report.manualChecklist.filter((c) => !report.manualReview?.items.some((i) => i.sc === c.sc))
    if (missing.length > 0) {
      lines.push(`**Not yet dispositioned**: ${missing.map((c) => c.sc).join(', ')}`, '')
    }
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

  return lines.join('\n')
}
