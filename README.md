# a11y-eval

[![CI](https://github.com/FrancoisChastel/a11y-eval/actions/workflows/ci.yml/badge.svg)](https://github.com/FrancoisChastel/a11y-eval/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/FrancoisChastel/a11y-eval)](https://github.com/FrancoisChastel/a11y-eval/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A523.6-brightgreen)

WCAG 2.2 AA evaluation tool built entirely on open-source components. Point it at a **repo** and/or a **running app**: it detects the framework, statically scans the source, starts the dev server, **crawls** the pages, runs runtime accessibility engines on each, and merges everything into one scored, gateable report. Designed as the **evaluation function** for accessibility agents: deterministic input → structured JSON output.

## Demo

**60-second explainer** — the whole pipeline in one pass (Remotion-rendered from verbatim CLI output; [HD video](https://github.com/FrancoisChastel/a11y-eval/releases/download/v0.8.0/a11y-eval-explainer.mp4)):

![Animated explainer: one command evaluates a repo (detect, static scan, dev-server start, crawl) into a scored report; four artifacts per run; violations gate CI while machine-flagged suspects pre-fill the review UI; mitigations are an agent-executable work order; fixes are verified with a baseline re-run animating the score to 100](docs/demo-explainer.gif)

Then complete the manual half in the generated review UI — machine-flagged suspects to confirm, signal-suggested N/A with auto-evidence, per-criterion procedures, live progress:

![Review UI demo: applying a signal-suggested Not applicable with auto-generated evidence, failing 2.4.3 Focus Order with typed evidence, and the progress footer](docs/demo-review-ui.gif)

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

Outputs to `--out` (default `a11y-report/`): `report.json` (agent contract), `report.md` (human summary: at-a-glance, top fixes, findings, signals, gaps, next steps), `mitigations.md` (agent-executable fix work order), `review.html` (human manual-review UI), and `evidence/` (element screenshots). Exit codes: `0` pass / pass-with-issues, `1` fail (critical or serious violations — CI gate), `2` error.

## What repo mode does

1. **Detect** — reads `package.json` + lockfiles: framework (Next/Angular/Svelte/Vue/CRA/Vite), package manager, dev script, default port.
2. **Static scan** — a **bundled, self-contained a11y ESLint** (a11y-eval's own eslint + jsx-a11y for React/JSX/TSX + vuejs-accessibility for Vue SFCs) always runs; it needs nothing from the target repo — no config, no installed node_modules, no lint setup. If the repo has its own ESLint config, it runs too as an *additional* source (its config may know framework rules ours doesn't) and results are merged + deduplicated. Findings carry `file:line:col` targets. Skip with `--no-static`, or merge an existing report instead with `--static-report <eslint.json>`.
3. **Start** — runs the detected dev script (or `--start-cmd`), polls until the app responds, and kills the whole process group afterward. Skipped when `--url` is provided.
4. **Crawl** — breadth-first same-origin link discovery from the base URL (same-directory scope for `file://`). Anchors, `mailto:`/`javascript:`, external origins, and asset links are skipped. Caps: `--max-pages` (15), `--max-depth` (3). On by default in repo mode (`--no-crawl` to disable).
5. **Evaluate every page** with the runtime engines, then merge runtime + static findings into one report.

## Engines

| Engine | Tool | Covers |
|--------|------|--------|
| `axe` | [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) via `@axe-core/playwright` | WCAG 2.0/2.1/2.2 A+AA automated rules: contrast, names/roles/values, ARIA validity, document structure |
| `keyboard` | Custom [Playwright](https://github.com/microsoft/playwright) checks | Gaps axe can't see: **2.1.1** click-affordance elements not keyboard-operable, **2.4.7** no visible focus indicator, **1.4.10** horizontal overflow at 320px |
| `cca` | [pngjs](https://github.com/pngjs/pngjs) pixel sampling + WCAG math | Colour-Contrast-Analyser-grade measurement of the text axe marks undecidable (gradients/images): exact computed foreground vs worst-point sampled background — deterministic verdicts with measured ratios |
| `sr` (opt-in `--sr`) | Chromium accessibility tree (default), real NVDA/VoiceOver via [Guidepup](https://github.com/guidepup/guidepup) (experimental) | Screen-reader narration per page: what an NVDA/VoiceOver user would hear, saved to `evidence/` and attached as review evidence |
| `vlm` (opt-in `--vlm`) | Any image-capable LLM via the provider layer | Vision judgments as tiered suspects/observations: alt-text adequacy, color-only meaning (grayscale pairs), focus-order overlays, contrast triage, reflow/hover/label observations, media keyframes |
| `static` | Bundled [ESLint](https://eslint.org) + [jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) + [vuejs-accessibility](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility) (self-contained; repo's own ESLint merged in when present) | Pre-render source issues in React (JS/JSX/TS/TSX) and Vue SFCs, mapped to `file:line:col` |

## CLI reference

```
# Evaluate (default command)
--url <url>            Seed page (http(s)://, file://, or local HTML path). Repeatable.
--repo <dir>           Source repo (enables repo mode: detect, static scan, start, crawl).
--start-cmd <cmd>      Command to start the app (default: detected dev script).
--port <n>             App port (default: framework default).
--crawl / --no-crawl   Toggle page discovery (default: on in repo mode, off otherwise).
--max-pages <n>        Crawl cap (default 15).      --max-depth <n>  Depth cap (default 3).
--no-static            Skip the bundled static scan.
--static-report <path> Merge an existing ESLint JSON report (eslint -f json).
--storage-state <path> Playwright storage-state JSON file for an authenticated browser session.
--baseline <path>      Previous report.json — classifies findings new/persisting/fixed
                       and carries its manual review forward into review.html.
--strict               Promote machine-flagged suspects into scoring and the verdict gate.
--interact             State-changing probes (change inputs, open dialogs). STAGING ONLY.
--llm [provider/model] LLM adjudication of the manual checklist, auto-merged (any provider).
--vlm [provider/model] Vision checks with tiered trust (model must accept images).
--sr [driver]          Screen-reader narration pass: axtree (default, simulation from
                       Chromium's accessibility tree, runs anywhere) | nvda | voiceover
                       (real drivers via Guidepup — experimental, need npx @guidepup/setup).
--out <dir>            Output dir (default a11y-report). --json  Print JSON to stdout.

# Subcommands
review   [--report <dir>] [--port <n>]      Serve the manual-review UI (127.0.0.1 only).
merge    --report <dir> --manual <file>     Merge a manual review → final report + verdict.
mitigate [--report <dir>]                   Regenerate mitigations.md (prefers final-report.json).
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
  "verdict": "fail",              // pass | pass-with-issues | fail (suspects excluded unless strict)
  "overall": "fail",              // only after a manual review is merged: fail | issues | no-known-violations
  "score": 40,                    // 0-100, weighted + instance-capped; scoreBreakdown itemizes it
  "totals": { "critical": 1, "serious": 3, "moderate": 5, "minor": 0 },
  "meta": { "repo": "/path", "framework": "vite", "staticScan": "bundled-a11y",
            "crawled": true, "seeds": ["…"], "command": "node src/cli.ts …",
            "vlm": "gemini/gemini-2.5-flash", "vlmNote": "…failed checks, if any…" },
  "pages": [ /* per-URL findings, page score, axe passes/incomplete, content signals */ ],
  "findings": [
    { "engine": "axe", "ruleId": "color-contrast", "impact": "serious", "wcag": ["1.4.3"],
      "page": "http://localhost:3000/", "targets": [".cta"], "html": "<div class=\"cta\">…</div>",
      "helpUrl": "https://dequeuniversity.com/rules/axe/…" },
    { "engine": "keyboard", "ruleId": "target-size-suspect", "impact": "moderate", "wcag": ["2.5.8"],
      "confidence": "suspect" },   // machine-flagged: pre-fills the review UI, gates only under --strict
    { "engine": "vlm", "ruleId": "vlm-alt-quality-suspect", "impact": "serious", "wcag": ["1.1.1"],
      "confidence": "suspect", "description": "… Proposed alt: \"…\"" },
    { "engine": "static", "ruleId": "jsx-a11y/alt-text", "impact": "moderate", "wcag": [],
      "page": "/app/src/App.tsx", "targets": ["/app/src/App.tsx:5:5"] }
  ],
  "scoreBreakdown": [ /* per-rule deductions with the instance cap made visible */ ],
  "remediationPlan": [ /* root-cause fix groups: steps, examples, pitfalls, effort */ ],
  "evidence": [ /* per-SC packets: headings, labels, tab-order, media, vlm-observations */ ],
  "baselineDiff": { "newCount": 1, "persistingCount": 3, "fixedCount": 9, "fixed": [ … ] },
  "manualReview": { /* merged human/LLM dispositions with evidence and provenance */ },
  "manualChecklist": [ /* the 16 SC automation cannot fully verify — the review queue */ ],
  "coverageNote": "…"
}
```

### Semantics (important for agents)

- **`verdict` gates on severity, not score.** Any `critical`/`serious` finding ⇒ `fail` (AA blocker). Only `moderate`/`minor` ⇒ `pass-with-issues`.
- **`pass` is NOT a compliance claim.** The literature puts reliable automation at ~13% of WCAG success criteria (44% partially automatable; tools observed reporting on ~1/6 of criteria in practice), and per W3C ACT a clean run only demonstrates *absence of detected failures*. Findings carry the ACT/EARL vocabulary in `actOutcome` (`failed` for violations, `incomplete` for suspects). `manualChecklist` lists the criteria a reviewing agent or human must still check. Never report "WCAG 2.2 AA compliant" from this tool alone.
- **`score` tracks progress**, not gating: 100 minus impact-weighted deductions (critical 15, serious 10, moderate 3, minor 1), same rule + same page capped at 5 instances so one systemic issue (a bad contrast token) reads as one problem, not a zero. Per W3C's accessibility-metrics research, the weights are engineering judgment (not user-impact-validated) and the score inherits tool coverage — it is **not comparable across sites or tools**; its supported use is same-site baseline-to-baseline regression tracking. See [docs/research/wcag-automation-literature.md](docs/research/wcag-automation-literature.md).
- **Suspects never gate by default.** `confidence: "suspect"` findings (geometry, content, and VLM checks) pre-fill the review UI with quotes and screenshots; only `--strict` promotes them into scoring and the verdict.
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

## How much of the manual checklist is automated?

The 16 criteria automation "cannot verify" are not one problem but three — and two of them yield:

| Tier | Criteria | What happens |
|------|----------|--------------|
| **Checked** (violations) | 3.2.1 on-focus context changes · 1.4.13 Esc-dismissability of detected tooltips · keyboard-inoperable custom sliders (2.5.7/2.1.1) · with `--interact`: 3.2.2 on-input navigation, dialog Escape traps (2.1.2) | Deterministic findings, gate the verdict |
| **Suspects** (confirm, don't hunt) | 2.5.8 target-size geometry (spacing + inline exceptions computed, labels unioned) · 2.4.3 tab-order upward jumps · 2.1.2 Tab-cycle stalls · 1.3.3 sensory-phrase lexicon · 3.1.2 offline language detection (franc) · 1.2.2 missing caption tracks | Pre-fill the review UI with quotes/screenshots; **never gate the verdict** unless `--strict` — false positives can't break CI trust |
| **Evidence + judgment** | 2.4.6 headings · 3.3.2 label adequacy · 1.4.1 color use · 3.3.3/3.3.7 flows · 1.2.5 media accuracy | Evidence packets collected (headings, labels+controls, tab-order trace, media inventory); judged by a human in the review UI, the evaluator skill, or `--llm` |

**`--vlm [provider/model]`** adds vision checks with tiered trust: tier 1 **flags suspects** (alt-text adequacy with proposed replacements, color-only meaning via grayscale comparison, focus order judged on numbered overlays, axe-incomplete contrast triage), tier 2 **prefills review observations** (320px reflow breakage, hover occlusion, visual label association), tier 3 **enriches** media criteria with keyframe spot-checks under a structural needs-expert ceiling. Same any-provider syntax (model must accept images); failed checks are reported in Gaps, never silently passed. `--llm [provider/model]` adjudicates the judgment criteria from the evidence packets and auto-merges the result as reviewer `llm:<model>` — **any backend**: `anthropic/…`, `openai/…`, `gemini/…`, `groq/…`, `ollama/…` (local, keyless), or `openai-compat/…` + `A11Y_LLM_BASE_URL` for any Chat Completions endpoint (keys via the provider's env var, `A11Y_LLM_API_KEY`, or gitignored `optimizer/.env`) — low-confidence verdicts become `needs-expert`, provenance is preserved, and an LLM disposition is never silently equivalent to human sign-off. `--interact` enables the state-changing probes (staging only). `data-a11y-eval-ignore` on an element excludes its text from the sensory/language checks — for pages quoting arbitrary content (the review UI uses it on itself).

## Human review UI

Every evaluation writes `review.html` next to the report — a self-contained, dependency-free page where a human reviewer completes the manual half of the evaluation:

- **Static mode**: open the file anywhere. Progress persists in the browser (localStorage); "Export" downloads `manual-review.json`.
- **Served mode**: `node src/cli.ts review --report a11y-report` — same page with autosave to disk, element **evidence screenshots** (captured server-side by Playwright), and one-click finalize-merge. Binds to 127.0.0.1 only.

The page shows the automated findings and remediation plan for context, then walks all 16 manual criteria with per-criterion "how to review" procedures. **Content signals** keep it honest: the evaluation detects media/forms/drag/hover content per page, so criteria with no matching content get a one-click justified "Not applicable" (with auto-generated evidence), while marking a criterion N/A *against* detected signals raises a warning. Optional feedback fields (assistive tech, browser, review method, reviewer) feed the report's provenance. Dispositions without evidence are accepted but listed as **undocumented** in the final report — visible, never hidden.

Merge the human's review (or an agent's) into the final verdict:

```bash
node src/cli.ts merge --report a11y-report --manual manual-review.json
# overall = fail | issues | no-known-violations   (any manual fail ⇒ fail; exit 1)
```

The review UI is evaluated by the tool itself in CI and must score a clean pass — the checker's own UI is held to its own standard.

## Mitigations and progress

Every evaluation (and every merge) writes **`mitigations.md`** — an agent-executable work order, not a report. It opens with rules of engagement (one group per change-set, every "Do NOT" is binding, never delete features to pass), then one section per root-cause group: the fix, steps, a before/after example, the anti-fix pitfalls, rule docs, and **every instance to fix** — CSS selector + offending HTML snippet for runtime findings, `file:line:col` for static ones — closing with the exact verification command (`your original invocation` + `--baseline`). Manual-review failures get their own evidence-driven sections: the reviewer's evidence *is* the specification, since no catalog exists for judgment criteria. Hand the file to a coding agent as-is.

Two modes:

- **Automatic** — written alongside `report.json` on every evaluation, and refreshed on every merge (CLI or review-UI finalize) so human failures flow in.
- **Manual** — `node src/cli.ts mitigate --report <dir>` regenerates on demand, preferring `final-report.json` when present.

Under the hood, the report's **`remediationPlan`** groups findings by root cause, ordered by impact then reach — one systemic cause (a bad color token, a repeated `div`-button component) reads as one fix, not forty findings.

**`--baseline previous/report.json`**: re-runs classify every finding as **new / persisting / fixed** and list what was fixed — the progress signal for fix loops, and the regression alarm for new violations. A baseline run's manual review is carried forward as prefill in the next `review.html`.

## Agent skill

`skills/a11y-evaluator/SKILL.md` packages this whole process as a harness-agnostic agent skill: CLI invocation recipes, report-contract semantics, per-criterion procedures for the LLM manual review (the 16 automation blind spots), the deliverable template with a mandatory Gaps section, and the anti-claims rules. It follows the [Agent Skills](https://agentskills.io) format (`name` + `description` frontmatter), so any harness that reads `SKILL.md` files can use it:

```bash
# Claude Code (personal skills)
cp -r skills/a11y-evaluator ~/.claude/skills/

# Any other harness: inject skills/a11y-evaluator/SKILL.md into the agent's context
```

`agents/a11y-evaluator.md` is a ready-made Claude Code subagent definition wrapping the skill (`cp agents/a11y-evaluator.md ~/.claude/agents/`).

## Fixer skill + automatic skill improvement (DSPy/GEPA)

`skills/a11y-fixer/SKILL.md` is the fixing counterpart: it consumes `mitigations.md` work orders and applies minimal, semantics-first patches with the anti-fix pitfalls as binding rules.

Its core instruction block is **automatically optimizable**: because this tool provides a deterministic 0-100 score, the skill's prompt can be treated as a program and improved by measurement instead of hand-tuning. `optimizer/optimize.py` runs a [DSPy](https://github.com/stanfordnlp/dspy) GEPA loop — candidate instructions fix broken fixture pages, a11y-eval scores each fix, the evaluator's findings feed GEPA's reflection, and a feature-preservation guard zeroes any candidate that "fixes" by deleting content. The winner is spliced back into the skill between managed markers.

```bash
python3 optimizer/optimize.py --dry-run                    # verify the loop, zero LM calls (runs in CI)
pip install -r optimizer/requirements.txt                  # dspy, for real runs
python3 optimizer/optimize.py --auto light --apply         # optimize on the fixtures
python3 optimizer/optimize.py --auto light --page snapshots/checkout.html --apply   # specialize for YOUR repo
python3 optimizer/optimize.py --target adjudicator --auto light --apply             # optimize the evaluator's judgment too
```

Both targets emit a **complete installable skill package** (`optimizer/out/<skill-name>/SKILL.md`, provenance + before/after score in frontmatter), and any litellm provider works via `--model` (`openai/…`, `gemini/…`, `ollama_chat/…`, …) with keys in gitignored `optimizer/.env`.

See **[docs/skill-optimization.md](docs/skill-optimization.md)** for how the loop works, costs, and bring-your-own-repo training. `agents/skill-optimizer.md` is an agent that runs the whole flow (baseline → snapshot → optimize → prove the delta) for a given repo.

## Development

```bash
pnpm test          # 31 unit tests (scoring, wcag mapping, static merge, report, detect, crawl)
pnpm typecheck
# Integration (fixtures are the regression suite):
node src/cli.ts --url test-fixtures/site/index.html --crawl          # discovers 3 pages, fails on flawed.html
node src/cli.ts --url test-fixtures/accessible-form.html             # pass, score 100
node src/cli.ts --repo test-fixtures/mini-app --no-crawl --url test-fixtures/site/page2.html
                                                                        # bundled static scan: 8 findings (5 jsx + 3 vue)
node src/cli.ts --url test-fixtures/wave1.html --interact             # every wave-1 engine + probe fires
node test-fixtures/mock-llm-server.mjs 4941 &                         # then: full --vlm E2E without any provider
A11Y_LLM_BASE_URL=http://127.0.0.1:4941/v1 A11Y_LLM_API_KEY=test node src/cli.ts --url test-fixtures/wave1.html --vlm openai-compat/mock-vlm
```

The unit-test count grows with the suite — `pnpm test` prints the current number (72 as of v0.11.0).

Regenerating the README demos after UI/CLI changes: the explainer via `cd video && pnpm install && pnpm render` (Remotion — scenes in `video/src/`, terminal transcripts kept verbatim from real runs in `video/src/content.ts`), then an ffmpeg palette pass to GIF (`fps=10,scale=900` + 128-color palettegen/paletteuse → `docs/demo-explainer.gif`) and upload the mp4 as a release asset for the HD link; the review-UI GIF via `node docs/record-review-demo.mjs <review.html> out.webm` + ffmpeg (fps 7, 820px, 64 colors).

## Known limitations

- TypeScript is pinned to 5.9.x: `@typescript-eslint/parser` (used by the bundled static scan) does not support TS 7 yet.
- Focus-visibility is probed with programmatic `focus()`; exotic `:focus-visible`-only styling may differ under real keyboard input.
- The reflow check flags overflow, not the SC's exemptions (data tables, maps) — treat `horizontal-overflow-320` as review-required.
- The crawler follows links, so pages reachable only through form submissions, auth, or JS-only navigation need explicit `--url` seeds (or a Playwright storage state / dev auth bypass).
- SPA client-side route changes without `<a href>` links are not discovered — seed those routes explicitly.
- Real screen-reader drivers (`--sr nvda` / `--sr voiceover`) are experimental: they need the right OS, a one-time `npx @guidepup/setup`, and a headed browser; on any failure the run falls back to the `axtree` simulation with the gap recorded. The simulation reads Chromium's accessibility tree — close to what NVDA announces, but it is not NVDA itself.
- `--vlm` needs an image-capable model and costs per screenshot (≈4–8 calls/page); its verdicts are suspects/observations by design — vision models hallucinate confidently, so nothing a VLM says gates CI or substitutes for human sign-off.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test/fixture workflow, and the design rules (severity-gated verdicts, no compliance claims, the report JSON as a stable contract). Bug reports with a minimal repro HTML page are gold: they become permanent fixtures.

## License & acknowledgments

[MIT](LICENSE). Standing on excellent open-source shoulders: [axe-core](https://github.com/dequelabs/axe-core) (Deque), [Playwright](https://github.com/microsoft/playwright) (Microsoft), [ESLint](https://eslint.org) and [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y). None of these projects endorse this tool; all the accessibility expertise encoded in the automated rules is theirs.
