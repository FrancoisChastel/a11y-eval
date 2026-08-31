# a11y-eval

WCAG 2.2 AA evaluation tool built entirely on open-source components. Point it at a **repo** and/or a **running app**: it detects the framework, statically scans the source, starts the dev server, **crawls** the pages, runs runtime accessibility engines on each, and merges everything into one scored, gateable report. Designed as the **evaluation function** for accessibility agents: deterministic input → structured JSON output.

## Quick start

```bash
pnpm install && npx playwright install chromium

# Repo mode — the "given a repo" workflow:
# detect framework → static a11y scan of source → start dev server → crawl → evaluate → merged report
node src/cli.ts --repo /path/to/your-app

# App already running? Skip the server start:
node src/cli.ts --repo /path/to/your-app --url http://localhost:3000 --crawl

# No source access — just a URL:
node src/cli.ts --url http://localhost:3000 --crawl
```

Outputs `report.json` (agent contract) and `report.md` (human summary) to `--out` (default `a11y-report/`). Exit codes: `0` pass / pass-with-issues, `1` fail (critical or serious violations — CI gate), `2` error.

## What repo mode does

1. **Detect** — reads `package.json` + lockfiles: framework (Next/Angular/Svelte/Vue/CRA/Vite), package manager, dev script, default port.
2. **Static scan** — runs the repo's **own ESLint** when configured (its config knows the framework); otherwise falls back to a **bundled jsx-a11y** flat config for JSX/TSX. Findings carry `file:line:col` targets. Skip with `--no-static`, or merge an existing report instead with `--static-report <eslint.json>`.
3. **Start** — runs the detected dev script (or `--start-cmd`), polls until the app responds, and kills the whole process group afterward. Skipped when `--url` is provided.
4. **Crawl** — breadth-first same-origin link discovery from the base URL (same-directory scope for `file://`). Anchors, `mailto:`/`javascript:`, external origins, and asset links are skipped. Caps: `--max-pages` (15), `--max-depth` (3). On by default in repo mode (`--no-crawl` to disable).
5. **Evaluate every page** with the runtime engines, then merge runtime + static findings into one report.

## Engines

| Engine | Tool | Covers |
|--------|------|--------|
| `axe` | [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) via `@axe-core/playwright` | WCAG 2.0/2.1/2.2 A+AA automated rules: contrast, names/roles/values, ARIA validity, document structure |
| `keyboard` | Custom [Playwright](https://github.com/microsoft/playwright) checks | Gaps axe can't see: **2.1.1** click-affordance elements not keyboard-operable, **2.4.7** no visible focus indicator, **1.4.10** horizontal overflow at 320px |
| `static` | [ESLint](https://eslint.org) + repo config or bundled [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) | Pre-render source issues, mapped to `file:line:col` |

## CLI reference

```
--url <url>            Seed page (http(s)://, file://, or local HTML path). Repeatable.
--repo <dir>           Source repo (enables repo mode).
--start-cmd <cmd>      Command to start the app (default: detected dev script).
--port <n>             App port (default: framework default).
--crawl / --no-crawl   Toggle page discovery (default: on in repo mode, off otherwise).
--max-pages <n>        Crawl cap (default 15).      --max-depth <n>  Depth cap (default 3).
--no-static            Skip static scan.
--static-report <path> Merge an existing ESLint JSON report (eslint -f json).
--out <dir>            Output dir (default a11y-report). --json  Print JSON to stdout.
```

Library use:

```ts
import { evaluate } from './src/evaluate.ts'
const report = await evaluate({ urls: ['http://localhost:3000'], crawl: true, maxPages: 20 })
```

## The report contract (what agents consume)

```jsonc
{
  "target": "wcag22aa",
  "verdict": "fail",              // pass | pass-with-issues | fail
  "score": 40,                    // 0-100, weighted + instance-capped
  "totals": { "critical": 1, "serious": 3, "moderate": 5, "minor": 0 },
  "meta": { "repo": "/path", "framework": "vite", "staticScan": "bundled-jsx-a11y", "crawled": true, "seeds": ["…"] },
  "pages": [ /* per-URL findings, axe passes/incomplete counts */ ],
  "findings": [
    { "engine": "axe", "ruleId": "color-contrast", "impact": "serious", "wcag": ["1.4.3"],
      "page": "http://localhost:3000/", "targets": [".cta"], "html": "<div class=\"cta\">…</div>",
      "helpUrl": "https://dequeuniversity.com/rules/axe/…" },
    { "engine": "static", "ruleId": "jsx-a11y/alt-text", "impact": "moderate", "wcag": [],
      "page": "/app/src/App.tsx", "targets": ["/app/src/App.tsx:5:5"] }
  ],
  "manualChecklist": [ /* SC automation cannot verify — the agent/human review queue */ ],
  "coverageNote": "…"
}
```

### Semantics (important for agents)

- **`verdict` gates on severity, not score.** Any `critical`/`serious` finding ⇒ `fail` (AA blocker). Only `moderate`/`minor` ⇒ `pass-with-issues`.
- **`pass` is NOT a compliance claim.** Automation covers roughly 30–50% of WCAG. `manualChecklist` lists the criteria (1.4.13, 2.4.3, 2.5.7, 3.2.2, label adequacy, …) that a reviewing agent or human must still check. Never report "WCAG 2.2 AA compliant" from this tool alone.
- **`score` tracks progress**, not gating: 100 minus impact-weighted deductions (critical 15, serious 10, moderate 3, minor 1), same rule + same page capped at 5 instances so one systemic issue (a bad contrast token) reads as one problem, not a zero.
- **Static findings are advisory** (`moderate`/`minor`): runtime engines are the source of truth for what reaches the rendered page. A static finding with no runtime counterpart often means the component isn't on a crawled page — worth an agent's attention, not an automatic fix-reject.

### Suggested agent loop

```
1. run: node src/cli.ts --repo <dir>            → report.json
2. while verdict == fail: fix findings (critical→serious first; runtime findings give
   selector+html, static findings give file:line:col), re-run
3. when verdict != fail: walk manualChecklist against the crawled pages — this is where
   an LLM agent adds value beyond automation
4. only after both: report "no known violations; manual criteria reviewed" — never "compliant"
```

## Development

```bash
pnpm test          # 31 unit tests (scoring, wcag mapping, static merge, report, detect, crawl)
pnpm typecheck
# Integration (fixtures are the regression suite):
node src/cli.ts --url test-fixtures/site/index.html --crawl          # discovers 3 pages, fails on flawed.html
node src/cli.ts --url test-fixtures/accessible-form.html             # pass, score 100
node src/cli.ts --repo test-fixtures/mini-app --no-crawl --url test-fixtures/site/page2.html
                                                                        # bundled static scan: 5 jsx-a11y findings
```

## Known limitations

- TypeScript is pinned to 5.9.x: `@typescript-eslint/parser` (used by the bundled static scan) does not support TS 7 yet.
- Focus-visibility is probed with programmatic `focus()`; exotic `:focus-visible`-only styling may differ under real keyboard input.
- The reflow check flags overflow, not the SC's exemptions (data tables, maps) — treat `horizontal-overflow-320` as review-required.
- The crawler follows links, so pages reachable only through form submissions, auth, or JS-only navigation need explicit `--url` seeds (or a Playwright storage state / dev auth bypass).
- SPA client-side route changes without `<a href>` links are not discovered — seed those routes explicitly.
