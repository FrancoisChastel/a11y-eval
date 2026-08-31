export type Impact = 'critical' | 'serious' | 'moderate' | 'minor'

export type Engine = 'axe' | 'keyboard' | 'static' | 'agent' | 'human'

export type Verdict = 'pass' | 'pass-with-issues' | 'fail'

/** Merged verdict once a manual review exists: any manual fail elevates to 'fail'. */
export type OverallVerdict = 'fail' | 'issues' | 'no-known-violations'

/** Content detected on a page; gates the applicability of manual-review criteria. */
export interface ContentSignals {
  media: number
  forms: number
  drag: number
  hoverContent: number
  langParts: number
  iframes: number
}

export type ManualStatus = 'pass' | 'fail' | 'needs-expert' | 'not-applicable'

export type ReviewMethod = 'keyboard' | 'screen-reader' | 'visual' | 'code-read' | 'signal-based'

export interface ManualReviewItem {
  sc: string
  status: ManualStatus
  /** What was inspected and observed. Items without evidence are reported as undocumented. */
  evidence?: string
  /** Affected pages for page-specific dispositions; omitted = applies app-wide. */
  pages?: string[]
  /** Severity for fail items (default: serious). */
  severity?: Impact
  method?: ReviewMethod
  /** True when the status was suggested from content signals (e.g. auto N/A: no media detected). */
  autoSuggested?: boolean
  /** Evidence screenshot paths (served review mode). */
  screenshots?: string[]
}

export interface ManualReview {
  reviewer?: { name?: string; contact?: string }
  environment?: { browser?: string; os?: string; assistiveTech?: string }
  startedAt?: string
  finishedAt?: string
  items: ManualReviewItem[]
}

export interface Remediation {
  summary: string
  steps: string[]
  example?: { bad: string; good: string }
  effort: 'trivial' | 'small' | 'medium' | 'large'
  pitfalls: string[]
}

/** One root cause covering many findings — fix once, clear the group. */
export interface RemediationGroup {
  ruleId: string
  engine: Engine
  impact: Impact
  findingCount: number
  pages: string[]
  wcag: string[]
  recommendation: Remediation
}

/** One row of the explainable score: what a rule cost and how the cap applied. */
export interface ScoreDeduction {
  ruleId: string
  engine: Engine
  impact: Impact
  /** Total instances found. */
  instances: number
  /** Instances that counted toward the score (capped at 5 per rule per page). */
  counted: number
  deduction: number
}

export type BaselineStatus = 'new' | 'persisting'

export interface BaselineDiff {
  baselinePath: string
  newCount: number
  persistingCount: number
  fixedCount: number
  /** Findings present in the baseline but absent now. */
  fixed: { ruleId: string; page: string; target: string }[]
}

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
  /** Set when a baseline diff ran: whether this finding is new or was already present. */
  baselineStatus?: BaselineStatus
}

export interface PageResult {
  url: string
  findings: Finding[]
  /** Number of axe rules that passed — context for coverage, not proof of compliance. */
  passes: number
  /** Axe rules needing manual confirmation on this page. */
  incomplete: number
  /** Detected content types, used to gate manual-review applicability. */
  signals?: ContentSignals
  /** Page-local score (same weighting/cap as the global score, static findings excluded). */
  score?: number
}

export interface ManualCheckItem {
  sc: string
  name: string
  why: string
  /** Reviewer-facing procedure: what to inspect and how. */
  how: string
  /** Which content signal gates applicability; null = always review, never auto-N/A. */
  signal: keyof ContentSignals | null
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
  /** The CLI invocation that produced this report — quoted verbatim in verification steps. */
  command?: string
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
  /** Per-rule deductions explaining the score. */
  scoreBreakdown?: ScoreDeduction[]
  verdict: Verdict
  /** Success criteria that automation cannot verify — must be reviewed by a human or a reviewing agent. */
  manualChecklist: ManualCheckItem[]
  coverageNote: string
  /** Root-cause-grouped fix plan, ordered by impact then reach. */
  remediationPlan?: RemediationGroup[]
  /** Present when --baseline was given. */
  baselineDiff?: BaselineDiff
  /** Present after merging a manual review (merge command / review UI). */
  manualReview?: ManualReview
  /** Merged verdict; only set when manualReview is present. */
  overall?: OverallVerdict
  /** SC dispositioned without evidence — reported, not hidden. */
  undocumentedDispositions?: string[]
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
  /** Path to a previous report.json to diff against (new / fixed / persisting). */
  baselinePath?: string
  /** Max focusable elements to test for visible focus per page. */
  focusSampleSize?: number
  meta?: ReportMeta
}
