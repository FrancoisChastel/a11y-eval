import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { diffAgainstBaseline, fingerprint } from './baseline.ts'
import { discoverPages } from './crawl.ts'
import { runAxe } from './engines/axe.ts'
import { runContentChecks, runHoverProbe } from './engines/content.ts'
import { runFocusFlowChecks } from './engines/focusFlow.ts'
import { runTargetSizeCheck } from './engines/geometry.ts'
import { runInteractProbes } from './engines/interact.ts'
import { runKeyboardChecks } from './engines/keyboard.ts'
import { collectSignals } from './engines/signals.ts'
import { eslintReportToFindings } from './engines/staticMerge.ts'
import { resolveBackend } from './engines/adjudicate.ts'
import { runVlmChecks } from './engines/vlm.ts'
import { runCcaContrast } from './engines/contrast.ts'
import { runScreenReader } from './engines/screenReader.ts'
import { buildRemediationPlan } from './remediations.ts'
import { actOutcomeFor, computeScore, computeScoreBreakdown, computeTotals, computeVerdict, partitionFindings } from './scoring.ts'
import type { BaselineDiff, EvaluateOptions, EvidencePacket, Finding, PageResult, Report } from './types.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from './wcag.ts'

export const VERSION = '0.13.0'

const DEFAULT_MAX_PAGES = 15
const DEFAULT_MAX_DEPTH = 3
const MAX_EVIDENCE_SHOTS_PER_PAGE = 10

const captureEvidenceShots = async (page: Page, findings: Finding[], evidenceDir: string, pageIndex: number): Promise<void> => {
  await mkdir(evidenceDir, { recursive: true })
  let taken = 0
  for (const finding of findings) {
    if (taken >= MAX_EVIDENCE_SHOTS_PER_PAGE) break
    const selector = finding.targets[0]
    if (!selector) continue
    try {
      const name = `finding-p${pageIndex}-${taken}-${finding.ruleId}.png`
      await page.locator(selector).first().screenshot({ path: join(evidenceDir, name), timeout: 2_000 })
      finding.evidence = [...(finding.evidence ?? []), `evidence/${name}`]
      taken += 1
    } catch {
      /* selector not screenshotable — skip */
    }
  }
}

/**
 * The evaluation function. Deterministic input → structured output: crawls if
 * asked, then runs every engine per page — axe, legacy keyboard checks, target-size
 * geometry, focus-flow (on-focus/traps/order), content checks (sensory phrases,
 * language of parts, caption tracks, sliders), hover probes, and opt-in interactive
 * probes — plus content signals and evidence packets. Violations gate the verdict;
 * suspects pre-fill the manual review (and gate only under strict).
 */
export const evaluate = async (options: EvaluateOptions): Promise<Report> => {
  if (options.urls.length === 0) throw new Error('evaluate: at least one URL is required')
  const startedAt = new Date().toISOString()
  const strict = options.strict ?? false

  const staticFindings: Finding[] = [
    ...(options.staticFindings ?? []),
    ...(options.staticReportPath
      ? eslintReportToFindings(JSON.parse(await readFile(options.staticReportPath, 'utf8')))
      : []),
  ]

  const vlmBackend = options.vlm ? resolveBackend(options.vlm) : null
  const vlmNotes: string[] = []
  const srNotes: string[] = []
  let srDriverUsed: string | undefined

  const headed = options.screenReader === 'nvda' || options.screenReader === 'voiceover'
  const browser = await chromium.launch({ headless: !headed })
  const pages: PageResult[] = []
  const evidence: EvidencePacket[] = []
  let urls = options.urls
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
    })

    if (options.crawl) {
      urls = await discoverPages(context, options.urls, {
        maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
        maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      })
    }

    for (const [pageIndex, url] of urls.entries()) {
      const page = await context.newPage()
      try {
        await page.goto(url, { waitUntil: 'networkidle' })
        const axeResult = await runAxe(page, url)
        const cca = await runCcaContrast(page, url, axeResult.incompleteItems)
        evidence.push(...cca.evidence)
        const signals = await collectSignals(page)

        if (options.screenReader) {
          const sr = await runScreenReader(page, url, options.screenReader)
          evidence.push(sr.evidence)
          srDriverUsed = sr.driverUsed
          if (sr.note) srNotes.push(`${url}: ${sr.note}`)
          if (options.evidenceDir) {
            await mkdir(options.evidenceDir, { recursive: true })
            await writeFile(join(options.evidenceDir, `narration-p${pageIndex}.txt`), sr.phrases.join('\n'))
          }
        }
        const keyboardFindings = await runKeyboardChecks(page, url, options.focusSampleSize)
        const targetSizeFindings = await runTargetSizeCheck(page, url)
        const contentResult = await runContentChecks(page, url)
        const hoverFindings = await runHoverProbe(page, url)
        const interactFindings = options.interact ? await runInteractProbes(page, url) : []
        // Fresh load before focus-flow: earlier engines (focus sampling, hover and
        // interact probes) may have opened dialogs or moved sequential-focus state.
        await page.goto(url, { waitUntil: 'networkidle' })
        const focusFlow = await runFocusFlowChecks(page, url)

        let vlmFindings: Finding[] = []
        if (vlmBackend) {
          const vlm = await runVlmChecks(page, url, vlmBackend, {
            stops: focusFlow.stops,
            // CCA already measured these deterministically; VLM only triages the rest.
            incompleteItems: axeResult.incompleteItems.filter((i) => !cca.measuredTargets.includes(i.target)),
            signals,
          })
          vlmFindings = vlm.findings
          evidence.push(...vlm.evidence)
          vlmNotes.push(...vlm.notes.map((n) => `${url}: ${n}`))
        }

        const pageFindings = [
          ...axeResult.findings,
          ...cca.findings,
          ...keyboardFindings,
          ...targetSizeFindings,
          ...contentResult.findings,
          ...hoverFindings,
          ...interactFindings,
          ...focusFlow.findings,
          ...vlmFindings,
        ]
        if (options.evidenceDir) await captureEvidenceShots(page, pageFindings, options.evidenceDir, pageIndex)

        evidence.push(...contentResult.evidence, focusFlow.tabOrder)
        pages.push({
          url,
          findings: pageFindings,
          passes: axeResult.passes,
          incomplete: axeResult.incomplete,
          signals,
          score: computeScore(partitionFindings(pageFindings, strict).gating),
        })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  let findings: Finding[] = [...pages.flatMap((p) => p.findings), ...staticFindings].map((f) => ({ ...f, actOutcome: actOutcomeFor(f) }))

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

  const { gating } = partitionFindings(findings, strict)
  const totals = computeTotals(gating)

  return {
    tool: 'a11y-eval',
    version: VERSION,
    target: 'wcag22aa',
    startedAt,
    finishedAt: new Date().toISOString(),
    meta: {
      ...options.meta,
      crawled: options.crawl ?? false,
      seeds: options.urls,
      ...(options.vlm ? { vlm: options.vlm } : {}),
      ...(vlmNotes.length > 0 ? { vlmNote: vlmNotes.slice(0, 8).join(' | ') } : {}),
      ...(srDriverUsed ? { screenReader: srDriverUsed } : {}),
      ...(srNotes.length > 0 ? { screenReaderNote: srNotes.slice(0, 4).join(' | ') } : {}),
    },
    pages,
    findings,
    totals,
    score: computeScore(gating),
    scoreBreakdown: computeScoreBreakdown(gating),
    verdict: computeVerdict(totals),
    manualChecklist: MANUAL_CHECKLIST,
    coverageNote: COVERAGE_NOTE,
    remediationPlan: buildRemediationPlan(gating),
    baselineDiff,
    evidence,
    strict,
  }
}
