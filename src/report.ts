import type { Finding, Report } from './types.ts'

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const

const sortedFindings = (findings: Finding[]): Finding[] =>
  [...findings].sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact))

export const renderMarkdown = (report: Report): string => {
  const lines: string[] = [
    `# Accessibility Evaluation — WCAG 2.2 AA`,
    '',
    `**Verdict: ${report.verdict.toUpperCase()}** · Score: ${report.score}/100 · ${report.findings.length} finding(s) across ${report.pages.length} page(s)`,
    '',
    `| Critical | Serious | Moderate | Minor |`,
    `|---|---|---|---|`,
    `| ${report.totals.critical} | ${report.totals.serious} | ${report.totals.moderate} | ${report.totals.minor} |`,
    '',
    `> ${report.coverageNote}`,
    '',
  ]

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

  lines.push(
    `## Manual review required (automation blind spots)`,
    '',
    `| SC | Name | Why automation cannot verify |`,
    `|---|---|---|`,
    ...report.manualChecklist.map((i) => `| ${i.sc} | ${i.name} | ${i.why} |`),
    '',
  )

  return lines.join('\n')
}
