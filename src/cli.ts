#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adjudicate, DEFAULT_ADJUDICATION_MODEL } from './engines/adjudicate.ts'
import { evaluate } from './evaluate.ts'
import { mergeManualReview } from './merge.ts'
import { renderMitigations } from './mitigations.ts'
import { detectRepo } from './repo/detect.ts'
import { startServer } from './repo/server.ts'
import { runStaticScan } from './repo/staticScan.ts'
import { renderMarkdown, scoreBar } from './report.ts'
import { renderReviewHtml } from './review/render.ts'
import { startReviewServer } from './review/server.ts'
import type { Finding, ManualReview, Report, ReportMeta } from './types.ts'

const USAGE = `a11y-eval — WCAG 2.2 AA evaluation for a running app and/or a source repo

Usage:
  node src/cli.ts --url <url> [--crawl]                     # evaluate running pages
  node src/cli.ts --repo <dir> [--url <url>]                # repo mode: static scan + start + crawl
  node src/cli.ts review [--report <dir>] [--port <n>]      # serve the manual-review UI
  node src/cli.ts merge --report <dir> --manual <file>      # merge a manual review into a final report
  node src/cli.ts mitigate [--report <dir>]                 # regenerate mitigations.md (agent work order)

Evaluate options:
  --url <url>            Seed page. http(s)://, file://, or local HTML path. Repeatable.
  --repo <dir>           Source repo to scan (enables repo mode).
  --start-cmd <cmd>      Command to start the app (default in repo mode: detected dev script).
  --port <n>             Port the app serves on (default: framework default).
  --crawl / --no-crawl   Discover same-scope pages (default ON in repo mode).
  --max-pages <n>        Crawl cap (default 15).
  --max-depth <n>        Crawl depth cap (default 3).
  --no-static            Skip the static source scan in repo mode.
  --static-report <path> Merge an existing ESLint JSON report instead of scanning.
  --baseline <path>      Previous report.json to diff against (new/fixed/persisting) and
                         to carry its manual review forward into the review UI.
  --strict               Promote machine-flagged suspects into scoring and the verdict gate.
  --interact             Run state-changing probes (change inputs, open dialogs). STAGING ONLY.
  --llm [model]          Adjudicate the manual checklist with an LLM and auto-merge the result.
                         Any provider via "provider/model": anthropic/…, openai/…, gemini/…,
                         groq/…, mistral/…, deepseek/…, xai/…, openrouter/…, ollama/… (local,
                         keyless), or openai-compat/… + A11Y_LLM_BASE_URL for any Chat
                         Completions endpoint. Keys from the provider's usual env var or
                         A11Y_LLM_API_KEY; optimizer/.env is loaded automatically.
                         Default model: ${DEFAULT_ADJUDICATION_MODEL} (Anthropic).
  --vlm [provider/model] Vision checks on rendered pages (same provider syntax; model
                         must accept images). Tier 1 flags suspects (alt-text quality,
                         color-only meaning via grayscale pairs, focus-order overlays,
                         axe-incomplete contrast triage); tier 2 prefills review
                         observations (320px reflow, hover occlusion, label layout);
                         tier 3 enriches media criteria (needs-expert ceiling).
  --out <dir>            Output directory (default: a11y-report).
                         Writes report.json + report.md + review.html.
  --json                 Print the JSON report to stdout.
  --help                 Show this help.

Review options (subcommand "review"):
  --report <dir>         Directory containing report.json (default: a11y-report).
  --port <n>             UI port (default: 4936). Binds to 127.0.0.1 only.

Merge options (subcommand "merge"):
  --report <dir>         Directory containing report.json (default: a11y-report).
  --manual <path>        manual-review.json exported from the review UI.
  --out <dir>            Output directory (default: same as --report).

Mitigate options (subcommand "mitigate"):
  --report <dir>         Directory containing report.json (default: a11y-report).
                         Uses final-report.json when present so manual failures are included.

Mitigations run in two modes: automatic (every evaluation and merge writes
mitigations.md) and manual (the "mitigate" subcommand regenerates it on demand).

Exit codes: 0 = pass or pass-with-issues, 1 = fail (critical/serious violations, or a
manual fail after merge), 2 = usage/runtime error.`

interface CliArgs {
  urls: string[]
  strict: boolean
  interact: boolean
  llm?: string
  vlmModel?: string
  repo?: string
  startCmd?: string
  port?: number
  crawl?: boolean
  maxPages?: number
  maxDepth?: number
  noStatic: boolean
  staticReportPath?: string
  baselinePath?: string
  manualPath?: string
  reportDir: string
  outDir?: string
  json: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { urls: [], strict: false, interact: false, noStatic: false, reportDir: 'a11y-report', json: false }
  const next = (i: number, flag: string): string => {
    const value = argv[i]
    if (value === undefined) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg === '--url') {
      const value = next(++i, '--url')
      args.urls.push(/^(https?|file):\/\//.test(value) ? value : pathToFileURL(resolve(value)).href)
    } else if (arg === '--repo') args.repo = resolve(next(++i, '--repo'))
    else if (arg === '--start-cmd') args.startCmd = next(++i, '--start-cmd')
    else if (arg === '--port') args.port = Number(next(++i, '--port'))
    else if (arg === '--crawl') args.crawl = true
    else if (arg === '--no-crawl') args.crawl = false
    else if (arg === '--max-pages') args.maxPages = Number(next(++i, '--max-pages'))
    else if (arg === '--max-depth') args.maxDepth = Number(next(++i, '--max-depth'))
    else if (arg === '--no-static') args.noStatic = true
    else if (arg === '--static-report') args.staticReportPath = next(++i, '--static-report')
    else if (arg === '--baseline') args.baselinePath = resolve(next(++i, '--baseline'))
    else if (arg === '--strict') args.strict = true
    else if (arg === '--interact') args.interact = true
    else if (arg === '--llm') {
      const peek = argv[i + 1]
      args.llm = peek && !peek.startsWith('-') ? argv[++i] : DEFAULT_ADJUDICATION_MODEL
    } else if (arg === '--vlm') {
      const peek = argv[i + 1]
      args.vlmModel = peek && !peek.startsWith('-') ? argv[++i] : DEFAULT_ADJUDICATION_MODEL
    }
    else if (arg === '--manual') args.manualPath = resolve(next(++i, '--manual'))
    else if (arg === '--report') args.reportDir = next(++i, '--report')
    else if (arg === '--out') args.outDir = next(++i, '--out')
    else if (arg === '--json') args.json = true
    else throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`)
  }
  return args
}

/** setdefault-loads KEY=VALUE lines so API keys can live in gitignored env files, never in chat or shell profiles. */
const loadEnvFiles = (): void => {
  for (const file of ['optimizer/.env', '.env']) {
    const path = resolve(file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eq = trimmed.indexOf('=')
      const key = trimmed.slice(0, eq).trim()
      if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  }
}

const loadReport = async (reportDir: string): Promise<Report> =>
  JSON.parse(await readFile(join(reportDir, 'report.json'), 'utf8'))

/** Human-readable end-of-run summary; the machine-parseable key=value line follows it. */
const printSummary = (report: Report, outDir: string, extras: string[] = []): void => {
  const result = report.overall ?? report.verdict
  const topFix = report.remediationPlan?.filter((g) => g.engine !== 'human' && g.engine !== 'agent')[0]
  const width = 62
  const line = (label: string, value: string): string => `  ${label.padEnd(10)}${value}`
  const out = [
    '─'.repeat(width),
    `  a11y-eval · WCAG 2.2 AA`,
    line('Score', `${report.score}/100  ${scoreBar(report.score)}`),
    line(
      'Result',
      `${result.toUpperCase().replaceAll('-', ' ')} — ${report.totals.critical} critical · ${report.totals.serious} serious · ${report.totals.moderate} moderate · ${report.totals.minor} minor`,
    ),
    line('Pages', `${report.pages.length} evaluated${report.meta?.crawled ? ` (crawled from ${report.meta.seeds?.length ?? 1} seed(s))` : ''}`),
    ...(report.baselineDiff
      ? [line('Baseline', `${report.baselineDiff.newCount} new · ${report.baselineDiff.persistingCount} persisting · ${report.baselineDiff.fixedCount} fixed`)]
      : []),
    ...(topFix ? [line('Top fix', `[${topFix.impact}] ${topFix.ruleId} — ${topFix.recommendation.summary}`)] : []),
    ...extras.map((e) => line('', e)),
    line('Output', `${outDir}/  (report.md · mitigations.md · review.html)`),
    '─'.repeat(width),
  ]
  console.log(out.join('\n'))
}

const runMerge = async (args: CliArgs): Promise<void> => {
  if (!args.manualPath) throw new Error('merge requires --manual <manual-review.json>')
  const report = await loadReport(args.reportDir)
  const manual = JSON.parse(await readFile(args.manualPath, 'utf8')) as ManualReview
  const merged = mergeManualReview(report, manual)

  const outDir = args.outDir ?? args.reportDir
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'final-report.json'), JSON.stringify(merged, null, 2))
  await writeFile(join(outDir, 'final-report.md'), renderMarkdown(merged))
  await writeFile(join(outDir, 'mitigations.md'), renderMitigations(merged))
  const manualFails = manual.items.filter((i) => i.status === 'fail').length
  printSummary(merged, outDir, manualFails > 0 ? [`${manualFails} manual failure(s) merged into the work order`] : [])
  console.log(
    `overall=${merged.overall} score=${merged.score} ` +
      `critical=${merged.totals.critical} serious=${merged.totals.serious} ` +
      `moderate=${merged.totals.moderate} minor=${merged.totals.minor} → ${join(outDir, 'final-report.md')}`,
  )
  process.exitCode = merged.overall === 'fail' ? 1 : 0
}

const runMitigate = async (args: CliArgs): Promise<void> => {
  let report: Report
  try {
    report = JSON.parse(await readFile(join(args.reportDir, 'final-report.json'), 'utf8'))
    console.error('using final-report.json (manual review included)')
  } catch {
    report = await loadReport(args.reportDir)
  }
  const out = join(args.outDir ?? args.reportDir, 'mitigations.md')
  await mkdir(args.outDir ?? args.reportDir, { recursive: true })
  await writeFile(out, renderMitigations(report))
  const groups = (report.remediationPlan ?? []).filter((g) => g.engine !== 'human' && g.engine !== 'agent').length
  const manualFails = report.manualReview?.items.filter((i) => i.status === 'fail').length ?? 0
  console.log(`groups=${groups} manual-failures=${manualFails} → ${out}`)
}

const runEvaluate = async (args: CliArgs): Promise<void> => {
  const meta: ReportMeta = { staticScan: 'none' }
  let staticFindings: Finding[] = []
  let stopServer: (() => Promise<void>) | undefined

  try {
    if (args.repo) {
      const info = detectRepo(args.repo)
      meta.repo = args.repo
      meta.framework = info.framework
      console.error(`repo: ${args.repo} (framework=${info.framework}, pm=${info.packageManager})`)

      if (!args.noStatic && !args.staticReportPath) {
        const scan = runStaticScan(args.repo, info)
        staticFindings = scan.findings
        meta.staticScan = scan.mode
        meta.staticScanNote = scan.note
        console.error(`static scan: ${scan.mode}, ${scan.findings.length} finding(s)${scan.note ? ` — ${scan.note}` : ''}`)
      }

      if (args.urls.length === 0) {
        const command = args.startCmd ?? info.startCommand
        if (!command) {
          throw new Error(
            'Repo has no dev/start/serve script and no --start-cmd was given. Provide --start-cmd or a running --url.',
          )
        }
        const port = args.port ?? info.defaultPort ?? 3000
        const baseUrl = `http://localhost:${port}/`
        console.error(`starting app: "${command}" → waiting for ${baseUrl}`)
        stopServer = await startServer(command, args.repo, baseUrl)
        args.urls.push(baseUrl)
      }
      if (args.crawl === undefined) args.crawl = true
    }
    if (args.urls.length === 0) throw new Error(`Provide --url and/or --repo.\n\n${USAGE}`)
    if (args.staticReportPath) meta.staticScan = 'external-report'

    // Record the invocation (minus any --baseline pair) so mitigations.md can
    // quote an exact verification command.
    const argvTail = process.argv.slice(2).filter((a, i, all) => a !== '--baseline' && all[i - 1] !== '--baseline')
    meta.command = ['node src/cli.ts', ...argvTail].join(' ')

    if (args.vlmModel) loadEnvFiles()
    if (args.interact) {
      console.error('WARNING: --interact runs state-changing probes (changing inputs, opening dialogs). Staging/fixtures only — never production.')
    }
    const outDirEarly = args.outDir ?? args.reportDir
    const report = await evaluate({
      urls: args.urls,
      crawl: args.crawl ?? false,
      maxPages: args.maxPages,
      maxDepth: args.maxDepth,
      staticReportPath: args.staticReportPath,
      staticFindings,
      baselinePath: args.baselinePath,
      strict: args.strict,
      interact: args.interact,
      vlm: args.vlmModel,
      evidenceDir: join(resolve(outDirEarly), 'evidence'),
      meta,
    })

    // Carry a baseline run's manual review forward as prefill for the new review page.
    let priorManual: ManualReview | null = null
    if (args.baselinePath) {
      try {
        const baseline = JSON.parse(await readFile(args.baselinePath, 'utf8')) as Report
        priorManual = baseline.manualReview ?? null
        if (!priorManual) {
          const sibling = JSON.parse(await readFile(join(dirname(args.baselinePath), 'manual-review.json'), 'utf8'))
          priorManual = sibling
        }
      } catch {
        /* no prior manual review to carry forward */
      }
    }

    const outDir = args.outDir ?? args.reportDir
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(join(outDir, 'report.md'), renderMarkdown(report))
    await writeFile(join(outDir, 'mitigations.md'), renderMitigations(report))
    await writeFile(join(outDir, 'review.html'), renderReviewHtml(report, { served: false, manual: priorManual }))

    if (args.llm) {
      loadEnvFiles()
      console.error(`LLM adjudication with ${args.llm}…`)
      const review = await adjudicate(report, args.llm)
      const merged = mergeManualReview(report, review)
      await writeFile(join(outDir, 'manual-review.json'), JSON.stringify(review, null, 2))
      await writeFile(join(outDir, 'final-report.json'), JSON.stringify(merged, null, 2))
      await writeFile(join(outDir, 'final-report.md'), renderMarkdown(merged))
      await writeFile(join(outDir, 'mitigations.md'), renderMitigations(merged))
      printSummary(merged, outDir, [`LLM-adjudicated by ${args.llm} — dispositions are agent provenance, not human sign-off`])
      console.log(
        `overall=${merged.overall} score=${merged.score} verdict=${merged.verdict} pages=${merged.pages.length}`,
      )
      process.exitCode = merged.overall === 'fail' ? 1 : 0
      return
    }

    if (args.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      const extras = staticFindings.length > 0 ? [`${staticFindings.length} static source finding(s) merged`] : []
      if (args.vlmModel) {
        const vlmSuspects = report.findings.filter((f) => f.engine === 'vlm').length
        extras.push(`VLM checks by ${args.vlmModel}: ${vlmSuspects} suspect(s) flagged${report.meta?.vlmNote ? ' (some checks failed — see gaps)' : ''}`)
      }
      printSummary(report, outDir, extras)
      console.log(
        `verdict=${report.verdict} score=${report.score} ` +
          `critical=${report.totals.critical} serious=${report.totals.serious} ` +
          `moderate=${report.totals.moderate} minor=${report.totals.minor} ` +
          `pages=${report.pages.length} static=${staticFindings.length}` +
          (report.baselineDiff ? ` new=${report.baselineDiff.newCount} fixed=${report.baselineDiff.fixedCount}` : ''),
      )
    }
    process.exitCode = report.verdict === 'fail' ? 1 : 0
  } finally {
    if (stopServer) await stopServer()
  }
}

const main = async (): Promise<void> => {
  const [subcommand, ...rest] = process.argv.slice(2)
  if (subcommand === 'review') {
    const args = parseArgs(rest)
    await startReviewServer(args.reportDir, args.port ?? 4936)
  } else if (subcommand === 'merge') {
    await runMerge(parseArgs(rest))
  } else if (subcommand === 'mitigate') {
    await runMitigate(parseArgs(rest))
  } else {
    await runEvaluate(parseArgs(process.argv.slice(2)))
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
