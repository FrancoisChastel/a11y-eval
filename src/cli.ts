#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluate } from './evaluate.ts'
import { detectRepo } from './repo/detect.ts'
import { startServer } from './repo/server.ts'
import { runStaticScan } from './repo/staticScan.ts'
import { renderMarkdown } from './report.ts'
import type { Finding, ReportMeta } from './types.ts'

const USAGE = `a11y-eval — WCAG 2.2 AA evaluation for a running app and/or a source repo

Usage:
  node src/cli.ts --url <url> [--crawl]                     # evaluate running pages
  node src/cli.ts --repo <dir> [--url <url>]                # repo mode: static scan + start + crawl

Repo mode (--repo):
  Detects the framework and package manager, runs a static a11y scan on the source
  (the repo's own ESLint if configured, bundled jsx-a11y otherwise), starts the dev
  server (detected script, or --start-cmd), crawls from the base URL, and merges
  everything into one report. If --url is given, no server is started.

Options:
  --url <url>            Seed page. http(s)://, file://, or local HTML path. Repeatable.
  --repo <dir>           Source repo to scan (enables repo mode).
  --start-cmd <cmd>      Command to start the app (default in repo mode: detected dev script).
  --port <n>             Port the app serves on (default: framework default).
  --crawl                Discover same-scope pages from the seeds (default ON in repo mode).
  --no-crawl             Disable crawling in repo mode.
  --max-pages <n>        Crawl cap (default 15).
  --max-depth <n>        Crawl depth cap (default 3).
  --no-static            Skip the static source scan in repo mode.
  --static-report <path> Merge an existing ESLint JSON report instead of scanning.
  --out <dir>            Output directory (default: a11y-report). Writes report.json + report.md.
  --json                 Print the JSON report to stdout.
  --help                 Show this help.

Exit codes: 0 = pass or pass-with-issues, 1 = fail (critical/serious violations), 2 = usage/runtime error.`

interface CliArgs {
  urls: string[]
  repo?: string
  startCmd?: string
  port?: number
  crawl?: boolean
  maxPages?: number
  maxDepth?: number
  noStatic: boolean
  staticReportPath?: string
  outDir: string
  json: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { urls: [], noStatic: false, outDir: 'a11y-report', json: false }
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
    else if (arg === '--out') args.outDir = next(++i, '--out')
    else if (arg === '--json') args.json = true
    else throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`)
  }
  if (args.urls.length === 0 && !args.repo) throw new Error(`Provide --url and/or --repo.\n\n${USAGE}`)
  return args
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
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

    if (args.staticReportPath) meta.staticScan = 'external-report'

    const report = await evaluate({
      urls: args.urls,
      crawl: args.crawl ?? false,
      maxPages: args.maxPages,
      maxDepth: args.maxDepth,
      staticReportPath: args.staticReportPath,
      staticFindings,
      meta,
    })

    await mkdir(args.outDir, { recursive: true })
    await writeFile(join(args.outDir, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(join(args.outDir, 'report.md'), renderMarkdown(report))

    if (args.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(
        `verdict=${report.verdict} score=${report.score} ` +
          `critical=${report.totals.critical} serious=${report.totals.serious} ` +
          `moderate=${report.totals.moderate} minor=${report.totals.minor} ` +
          `pages=${report.pages.length} static=${staticFindings.length} → ${join(args.outDir, 'report.md')}`,
      )
    }
    process.exitCode = report.verdict === 'fail' ? 1 : 0
  } finally {
    if (stopServer) await stopServer()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
