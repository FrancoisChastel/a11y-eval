export type Impact = 'critical' | 'serious' | 'moderate' | 'minor'

export type Engine = 'axe' | 'keyboard' | 'static'

export type Verdict = 'pass' | 'pass-with-issues' | 'fail'

export interface Finding {
  engine: Engine
  ruleId: string
  impact: Impact
  /** WCAG success criteria, e.g. ["1.4.3"]. Empty when the rule maps to best practice only. */
  wcag: string[]
  description: string
  helpUrl?: string
  /** Page URL for runtime findings; file path for static findings. */
  page: string
  /** CSS selectors (runtime) or file:line locations (static). */
  targets: string[]
  /** Offending markup snippet, when available. */
  html?: string
}

export interface PageResult {
  url: string
  findings: Finding[]
  /** Number of axe rules that passed — context for coverage, not proof of compliance. */
  passes: number
  /** Axe rules needing manual confirmation on this page. */
  incomplete: number
}

export interface ManualCheckItem {
  sc: string
  name: string
  why: string
}

export interface ReportMeta {
  /** Repo evaluated in repo mode. */
  repo?: string
  framework?: string
  /** How the static findings were produced. */
  staticScan?: 'repo-eslint' | 'bundled-jsx-a11y' | 'external-report' | 'skipped' | 'none'
  staticScanNote?: string
  /** True when pages were discovered by crawling rather than listed explicitly. */
  crawled?: boolean
  seeds?: string[]
}

export interface Report {
  tool: 'a11y-eval'
  version: string
  target: 'wcag22aa'
  startedAt: string
  finishedAt: string
  meta?: ReportMeta
  pages: PageResult[]
  findings: Finding[]
  totals: Record<Impact, number>
  score: number
  verdict: Verdict
  /** Success criteria that automation cannot verify — must be reviewed by a human or a reviewing agent. */
  manualChecklist: ManualCheckItem[]
  coverageNote: string
}

export interface EvaluateOptions {
  urls: string[]
  /** Discover same-scope pages from the given URLs before evaluating. */
  crawl?: boolean
  /** Crawl caps (defaults: 15 pages, depth 3). */
  maxPages?: number
  maxDepth?: number
  /** Path to an ESLint-format JSON report to merge as static findings. */
  staticReportPath?: string
  /** Pre-computed static findings (repo mode) merged into the report. */
  staticFindings?: Finding[]
  /** Max focusable elements to test for visible focus per page. */
  focusSampleSize?: number
  meta?: ReportMeta
}
