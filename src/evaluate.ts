import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { diffAgainstBaseline, fingerprint } from './baseline.ts'
import { discoverPages } from './crawl.ts'
import { runAxe } from './engines/axe.ts'
import { runKeyboardChecks } from './engines/keyboard.ts'
import { collectSignals } from './engines/signals.ts'
import { eslintReportToFindings } from './engines/staticMerge.ts'
import { buildRemediationPlan } from './remediations.ts'
import { computeScore, computeScoreBreakdown, computeTotals, computeVerdict } from './scoring.ts'
import type { BaselineDiff, EvaluateOptions, Finding, PageResult, Report } from './types.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from './wcag.ts'

export const VERSION = '0.6.0'

const DEFAULT_MAX_PAGES = 15
const DEFAULT_MAX_DEPTH = 3

/**
 * The evaluation function. Deterministic input → structured output:
 * takes URLs (http(s):// or file://), optionally crawls same-scope pages first,
 * runs the runtime engines and content-signal detection on every page, merges
 * static findings, diffs against an optional baseline, and returns a Report with
 * severity totals, a bounded score, a verdict, a root-cause remediation plan,
 * and the manual checklist.
 */
export const evaluate = async (options: EvaluateOptions): Promise<Report> => {
  if (options.urls.length === 0) throw new Error('evaluate: at least one URL is required')
  const startedAt = new Date().toISOString()

  const staticFindings: Finding[] = [
    ...(options.staticFindings ?? []),
    ...(options.staticReportPath
      ? eslintReportToFindings(JSON.parse(await readFile(options.staticReportPath, 'utf8')))
      : []),
  ]

  const browser = await chromium.launch()
  const pages: PageResult[] = []
  let urls = options.urls
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

    if (options.crawl) {
      urls = await discoverPages(context, options.urls, {
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      })
    }

    for (const url of urls) {
      const page = await context.newPage()
      try {
        await page.goto(url, { waitUntil: 'networkidle' })
        const axeResult = await runAxe(page, url)
        const signals = await collectSignals(page)
        const keyboardFindings = await runKeyboardChecks(page, url, options.focusSampleSize)
        const pageFindings = [...axeResult.findings, ...keyboardFindings]
        pages.push({
          url,
          findings: pageFindings,
          passes: axeResult.passes,
          incomplete: axeResult.incomplete,
          signals,
          score: computeScore(pageFindings),
        })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  let findings = [...pages.flatMap((p) => p.findings), ...staticFindings]

  let baselineDiff: BaselineDiff | undefined
  if (options.baselinePath) {
    const baseline = JSON.parse(await readFile(options.baselinePath, 'utf8')) as Report
    const result = diffAgainstBaseline(findings, baseline, options.baselinePath)
    findings = result.findings
    baselineDiff = result.diff
    const byPrint = new Map(findings.map((f) => [fingerprint(f), f.baselineStatus]))
    for (const page of pages) {
      page.findings = page.findings.map((f) => ({ ...f, baselineStatus: byPrint.get(fingerprint(f)) }))
    }
  }

  const totals = computeTotals(findings)

  return {
    tool: 'a11y-eval',
    version: VERSION,
    target: 'wcag22aa',
    startedAt,
    finishedAt: new Date().toISOString(),
    meta: { ...options.meta, crawled: options.crawl ?? false, seeds: options.urls },
    pages,
    findings,
    totals,
    score: computeScore(findings),
    scoreBreakdown: computeScoreBreakdown(findings),
    verdict: computeVerdict(totals),
    manualChecklist: MANUAL_CHECKLIST,
    coverageNote: COVERAGE_NOTE,
    remediationPlan: buildRemediationPlan(findings),
    baselineDiff,
  }
}
