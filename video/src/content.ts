// Real output from actual a11y-eval runs (v0.8.0) — kept verbatim so the video
// never shows behavior the tool doesn't have.
import { TermLine } from './Terminal'
import { theme } from './theme'

export const evalLines: TermLine[] = [
  { text: 'node src/cli.ts --repo ./my-app', at: 8, cmd: true },
  { text: 'repo: ./my-app (framework=vite, pm=pnpm)', at: 48, color: theme.subtext },
  { text: 'static scan: bundled-jsx-a11y, 5 finding(s)', at: 62, color: theme.subtext },
  { text: 'starting app: "pnpm run dev" → waiting for http://localhost:5173/', at: 76, color: theme.subtext },
  { text: '──────────────────────────────────────────────────────────────', at: 120 },
  { text: '  a11y-eval · WCAG 2.2 AA', at: 126, bold: true },
  { text: '  Score     55/100  ██████░░░░', at: 134, color: theme.yellow, bold: true },
  { text: '  Result    FAIL — 1 critical · 3 serious · 0 moderate · 0 minor', at: 142, color: theme.red },
  { text: '  Pages     6 evaluated (crawled from 1 seed(s))', at: 150 },
  { text: '  Top fix   [critical] image-alt — Give every informative image a meaningful alt', at: 158, color: theme.teal },
  { text: '  Output    a11y-report/  (report.md · mitigations.md · review.html)', at: 166 },
  { text: '──────────────────────────────────────────────────────────────', at: 172 },
]

export const mitigationsLines: TermLine[] = [
  { text: 'head -18 a11y-report/mitigations.md', at: 6, cmd: true },
  { text: '# Mitigation Work Order — WCAG 2.2 AA', at: 42, bold: true, color: theme.mauve },
  { text: '', at: 46 },
  { text: '## Rules of engagement', at: 52, color: theme.blue },
  { text: '3. Every **Do NOT** is binding. Suppressing a rule, hiding an element', at: 60, color: theme.subtext },
  { text: '   from assistive technology ... is a failed fix.', at: 64, color: theme.subtext },
  { text: '', at: 68 },
  { text: '## Group 1 of 4 — [critical] `image-alt`', at: 76, bold: true },
  { text: '**Fix:** Give every informative image a meaningful alt; mark decorative ones empty.', at: 86 },
  { text: '**Do NOT:** alt="" on an informative image passes the scanner and fails the user.', at: 96, color: theme.red },
  { text: '**Instances to fix (all of them):**', at: 106, color: theme.teal },
  { text: '1. `img` on /pricing', at: 114 },
  { text: '   <img src="chart.png">', at: 120, color: theme.yellow },
]

export const fixLoopLines: TermLine[] = [
  { text: 'node src/cli.ts --repo ./my-app --baseline a11y-report/report.json', at: 8, cmd: true },
  { text: '  Result    PASS — 0 critical · 0 serious · 0 moderate · 0 minor', at: 80, color: theme.green, bold: true },
  { text: '  Baseline  0 new · 0 persisting · 9 fixed', at: 92, color: theme.teal },
  { text: '  Suspects  2 machine-flagged, pre-filled in review.html (not gating)', at: 104, color: theme.yellow },
]
