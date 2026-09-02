---
name: a11y-evaluator
description: Run a complete WCAG 2.2 AA evaluation of a web app or repo — automated engines via the a11y-eval CLI (axe-core, keyboard/focus/reflow checks, static jsx-a11y scan, multi-page crawl) plus an LLM manual review of the 16 criteria automation cannot verify. Use when asked to evaluate, audit, review, or score accessibility, WCAG conformance readiness, or a11y of a site, app, page, PR, or repository.
version: 0.3.0
license: MIT
---

# Accessibility Evaluator (WCAG 2.2 AA)

You are performing an accessibility evaluation. It has two mandatory halves:

1. **Automated pass** — run the `a11y-eval` CLI (axe-core + custom runtime checks + static source scan + crawl). Machines are better than you at contrast math, ARIA validity, and coverage across many pages. Never eyeball what the tool can measure.
2. **Manual pass** — you review the success criteria automation cannot verify (the report's `manualChecklist`). This is where you add value; skipping it makes the evaluation wrong, not just incomplete.

**Iron rule: never claim "WCAG 2.2 AA compliant".** The strongest legitimate conclusion is: "no known violations; automated checks pass and the manual criteria were reviewed with the evidence below."

Grounding from the literature (see docs/research/wcag-automation-literature.md): W3C ACT outcomes are asymmetric — fails prove non-conformance, passes prove nothing; reliable automation is estimated at ~13% of success criteria. Findings carry this vocabulary as `actOutcome`: violations `failed`, suspects `incomplete`.

**WCAG-EM correspondence.** This process approximates W3C's evaluation methodology: scope → your Phase 1 invocation; explore/sample → crawl + seed selection (crawling is *convenience* sampling — say so whenever the evaluation is meant to represent a whole site); audit the sample → Phases 1–3; report → Phase 4. For site-level statements, seed a representative page set (templates, key flows, states), not just what the crawler reaches.

## When to Activate

- "Evaluate / audit / review the accessibility of <app | url | repo | PR>"
- "Is this WCAG compliant?" / "score our a11y" / "find accessibility issues"
- A quality gate needs an accessibility verdict before ship
- Another agent produced UI and its output must be evaluated

## Setup

The tool lives at `https://github.com/FrancoisChastel/a11y-eval` (MIT). Requires Node ≥ 23.6 and pnpm (or npm).

```bash
git clone https://github.com/FrancoisChastel/a11y-eval.git && cd a11y-eval
pnpm install && npx playwright install chromium
```

If the clone already exists, reuse it. If the environment cannot run browsers at all, say so explicitly and downgrade the evaluation to "static scan + source review only — runtime status unknown"; do not silently skip the runtime pass.

## Phase 1 — Automated evaluation

Pick the mode that matches what you were given:

```bash
# A repo (preferred — full pipeline: detect, static scan, start dev server, crawl, evaluate)
node src/cli.ts --repo /path/to/app --out /tmp/a11y

# A repo whose app is already running (no server start)
node src/cli.ts --repo /path/to/app --url http://localhost:3000 --crawl --out /tmp/a11y

# Just a URL (no source access)
node src/cli.ts --url https://staging.example.com --crawl --out /tmp/a11y

# Specific pages only (no crawl)
node src/cli.ts --url http://localhost:3000/checkout --url http://localhost:3000/settings --out /tmp/a11y
```

Useful flags: `--max-pages <n>` / `--max-depth <n>` (crawl caps, default 15/3), `--no-crawl`, `--no-static`, `--start-cmd "<cmd>"` and `--port <n>` when detection guesses wrong, `--static-report <eslint.json>` to reuse an existing lint run, `--baseline <prev report.json>` on re-runs, `--strict` to make suspects gate, `--interact` for state-changing probes (staging only), `--llm [provider/model]` for machine adjudication, `--vlm [provider/model]` for vision checks (image-capable model), `--sr [axtree|nvda|voiceover]` for a screen-reader narration pass.

**Seed selection matters.** The crawler only follows real `<a href>` links. Before running, check the repo's router (`grep -r "path:" src/ --include="*.ts*"`, Next `app/`/`pages/` dirs, route tables) and add `--url` seeds for important routes the crawl would miss: SPA-only navigation, auth-gated pages (needs a running logged-in instance or dev bypass), form-flow steps, error/empty states.

Exit codes: `0` = pass or pass-with-issues, `1` = fail (has critical/serious), `2` = the tool itself failed — read stderr, fix the invocation (wrong port, app not starting, bad path), and rerun; a `2` is never an evaluation result.

## Phase 2 — Read the report

`<out>/report.json` is the contract:

- `verdict`: `fail` = at least one critical/serious automated violation (AA blocker). `pass-with-issues` = only moderate/minor. `pass` = no automated findings — **not** compliance.
- `score` (0–100): progress tracking only. Never gate on score; gate on verdict + your manual pass.
- `findings[]`: each has `engine`, `ruleId`, `impact`, `wcag` (success criteria), `page`, `targets` (CSS selectors for runtime, `file:line:col` for static), `html` snippet, `helpUrl`.
  - `engine: "axe"` — trust these; false positives are rare. `helpUrl` explains the fix.
  - `engine: "keyboard"` — custom checks: `keyboard-unreachable` (2.1.1), `focus-not-visible` (2.4.7), `horizontal-overflow-320` (1.4.10 — verify it isn't an exempt table/map before reporting).
  - `engine: "cca"` — deterministic pixel-contrast measurements on axe-undecidable text; trust the measured ratios (borderline ones are suspects).
  - `engine: "vlm"` — vision suspects (only with `--vlm`): confirm or dismiss like any suspect; alt-quality ones carry a proposed replacement alt.
  - `engine: "static"` — advisory (source-level). If a static finding has no runtime counterpart, the component likely isn't on any crawled page: say so rather than dropping it.
- `pages[]`: per-URL findings plus axe `passes`/`incomplete` counts. `incomplete` > 0 means axe itself wants human review on that page.
- `meta`: what actually ran (framework, static-scan mode, crawled seeds). If `meta.staticScan` is `"skipped"`, report that gap.

## Phase 3 — Manual review (the LLM pass)

Walk every entry in `report.json`'s `manualChecklist` against the evaluated pages. Inspect however your harness allows — a browser automation tool, a throwaway Playwright script (the repo has Playwright installed; `node -e` with `chromium.launch()` works), or reading rendered HTML and source templates. Each criterion gets a status: `pass`, `fail`, `needs-expert`, or `not-applicable` — **with evidence** (page, element, what you observed). No evidence, no status.

### Judgment principles

<!-- OPTIMIZED-INSTRUCTIONS:START — this block is the optimization target managed by optimizer/optimize.py --target adjudicator; it is also loaded at runtime by --llm adjudication. Manual edits are overwritten by --apply -->

Adjudicate each criterion from the machine-collected evidence, deciding "pass", "fail", or "needs-expert". Be conservative: prefer needs-expert over a guessed pass — a wrong pass ships a barrier, a needs-expert only costs a review. A criterion whose suspects clearly violate its judging rule is a fail; do not soften a demonstrated violation to needs-expert. Judge only from the evidence given — never assume unseen pages compensate. For label and heading adequacy, ask whether a first-time user would know what the section contains or what to enter, including format; generic or ambiguous wording fails. Quote the decisive evidence in every justification.

<!-- OPTIMIZED-INSTRUCTIONS:END -->

How to review each criterion:

| SC | Check | How |
|----|-------|-----|
| 1.2.2 / 1.2.5 | Captions / audio description | Find `<video>`, `<audio>`, embeds on evaluated pages. Media without captions/transcript → fail. No media → not-applicable. Accuracy of captions → needs-expert. |
| 1.3.3 | Sensory characteristics | Search page text and templates for instructions like "click the green button", "the box on the right", "when you hear the tone". Any found → fail. |
| 1.4.1 | Use of color | Links inside prose distinguished by more than color? Status/chart/required-field meaning carried by text or icon too? Inspect the rendered markup for the state variants. |
| 1.4.13 | Content on hover/focus | For each tooltip/popover/dropdown: dismissible with Esc? Pointer can move onto the content? Stays until dismissed? Script it or trace the component source. |
| 2.1.2 | No keyboard trap | Open every modal/drawer/overlay; confirm Tab cycles and Esc (or a reachable close button) exits. The tool only samples reachability — traps are yours to find. |
| 2.4.3 | Focus order | Tab through each page: does order follow the visual/logical reading order? Jumps to footer mid-form or into hidden content → fail. |
| 2.4.6 | Headings and labels | Read every heading and label: does it describe its section/input? Generic ("Section 1", "Input") or wrong → fail. |
| 2.5.7 | Dragging | Sliders, sortable lists, kanban, sketch inputs: is there a click/keyboard alternative? None → fail. No draggables → not-applicable. |
| 2.5.8 | Target size | Dense icon rows, toolbars, list actions: targets ≥24×24 CSS px or spaced/exempt? Measure via script or computed styles. |
| 3.1.2 | Language of parts | Content in another language than the page's `lang`: wrapped in its own `lang` attribute? |
| 3.2.1 | On focus | Focusing (not activating) anything must not open modals, move focus, or navigate. Tab through and watch. |
| 3.2.2 | On input | Changing a select/radio/checkbox must not auto-submit or navigate without prior warning. Exercise the forms. |
| 3.3.2 | Label adequacy | Automation checked presence; you check meaning. Placeholder-only "labels", ambiguous labels ("Date" — of what? format?), unlabeled icon buttons with only a title attr → fail. |
| 3.3.3 | Error suggestion | Submit forms with bad input: does each message say how to fix it ("Enter a date after the start date"), not just "Invalid"? |
| 3.3.7 | Redundant entry | In multi-step flows: is information asked twice without auto-fill/confirm? Trace the flow. |

Also re-check any axe `incomplete` items on pages where the count is non-zero (`pages[].incomplete`).

**Use the content signals.** `pages[].signals` counts media, form controls, drag affordances, hover-revealed content, foreign-language parts, and iframes per page. A criterion whose gating signal is 0 across all pages may be dispositioned `not-applicable` with the signal as evidence ("no media detected across N pages"). A criterion with signals present must never be marked N/A — the signals name the exact pages to inspect.

**Start from the machine's work, not from scratch.** The engines already automated much of this checklist:

- **Suspects** (`findings[].confidence === "suspect"`): machine-flagged candidates for 2.5.8 (target-size geometry with spacing/inline exceptions), 2.4.3 (tab-order upward jumps), 2.1.2 (Tab-cycle stalls), 1.3.3 (sensory phrases, quoted), 3.1.2 (foreign-language blocks), 1.2.2 (videos without caption tracks). Your job on these is **confirm or dismiss with evidence**, not hunt. Suspects do not gate the verdict (unless the run used `--strict`) — your confirmation is what turns them into failures.
- **Already checked as violations**: 3.2.1 (focus-triggered dialogs/navigation), 1.4.13 Esc-dismissability of detected tooltips, keyboard-inoperable custom sliders (2.5.7/2.1.1). Do not re-test what a violation already proves; spot-check the residue (e.g. hover content the probe could not detect).
- **Evidence packets** (`report.evidence`): collected headings (2.4.6), labels with their controls (3.3.2), media inventory, and the full tab-order trace — judge from these before opening pages.
- With `--interact` (staging only) the run also probed on-input context changes (3.2.2) and dialog Escape-dismissal.
- `--llm` runs a machine adjudication of the judgment criteria and auto-merges it as reviewer `llm:<model>` — treat those dispositions as a prior to verify, never as human sign-off; anything `needs-expert` is yours.
- `--vlm provider/model` adds vision checks on the rendered pages, tiered by trust: **tier 1 flags suspects** (alt-text adequacy with a proposed alt, color-only meaning proven by grayscale comparison, tab-order judged on a numbered overlay, axe-incomplete contrast triage) — confirm or dismiss them like any suspect; **tier 2 prefills observations** (`vlm-observation` evidence items for 320px reflow, hover occlusion, visual label layout) — weigh them, they are never findings; **tier 3 enriches** 1.2.2/1.2.5 with keyframe spot-checks that can never exceed needs-expert — a human still watches the video. Check `meta.vlmNote`: listed checks did NOT run and their criteria were not visually verified.
- `--sr` attaches a screen-reader narration (per-page `evidence/narration-p*.txt` + review evidence): read it as the linear experience an NVDA/VoiceOver user gets — reading order, announced names, and states. `meta.screenReader` says whether it came from a real driver or the axtree simulation; a `screenReaderNote` means the pass degraded.
- `data-a11y-eval-ignore` on an element excludes its text from the sensory/language checks — for pages that quote arbitrary content.

Record manual findings in the same shape as tool findings, with `engine: "agent"` and your evidence in `description` — downstream fixers then consume one uniform list.

**Working with a human reviewer instead?** Every evaluation writes `review.html` next to the report — a self-contained page where a human walks the same checklist (signal-guarded N/A, evidence fields, optional AT/browser feedback). `node src/cli.ts review --report <dir>` serves it with autosave and evidence screenshots; `node src/cli.ts merge --report <dir> --manual manual-review.json` merges their dispositions the same way yours are merged. Do not duplicate a human's manual pass — merge it.

## Phase 4 — Deliver the evaluation

Final verdict = worst of (automated verdict, manual pass): any manual `fail` on an AA criterion makes the overall result **fail** even if automation passed. Structure the deliverable:

```markdown
# Accessibility Evaluation — <target> (WCAG 2.2 AA)

**Result: FAIL | PASS WITH ISSUES | NO KNOWN VIOLATIONS** · automated score <n>/100 · <p> pages · <f> findings

## Top risks           ← 3 worst issues, in user-impact terms
## Automated findings  ← from report.json, grouped by page, critical→minor; selectors + helpUrls
## Manual review       ← the 16-SC table: status + evidence each
## Gaps                ← what was NOT evaluated: uncrawled routes, auth-gated pages,
                         skipped static scan, media accuracy, anything needs-expert
## Recommended fix order ← critical → serious → manual fails → moderate → minor
```

The **Gaps** section is mandatory. An evaluation that hides its blind spots is worse than no evaluation.

## Phase 5 — Recommend mitigations

Every evaluation writes **`mitigations.md`** — the agent-facing work order: rules of engagement, one section per root-cause group (fix, steps, before/after, binding **Do NOT** pitfalls, rule docs, and every instance with selector + html snippet or `file:line:col`), plus the exact verification command. **Start from it; do not re-derive it.** Regenerate on demand with `node src/cli.ts mitigate --report <dir>` (it prefers `final-report.json`, so merged manual failures are included). Then add what only you can:

1. **Locate the source** (repo mode): grep the repo for each instance's html snippet or class names; static findings already carry `file:line:col`. Name the file to change, not just the selector.
2. **Propose the concrete change** — a diff or exact replacement markup — honoring the catalog's pitfalls. One structural fix often clears several findings (a `div`→`button` swap fixes 2.1.1 + 4.1.2 and often 2.5.8): say so.
3. **Author mitigations for manual failures** — their `mitigations.md` sections carry the reviewer's evidence as the specification; the concrete change is yours to derive, and the criterion must be re-reviewed after fixing (automation cannot verify it).
4. **Order by leverage**: follow the work order's ordering, but surface "one token/component fixes N findings" opportunities first within each tier.

## Fix-and-re-evaluate loop

If you are also fixing (or feeding a fixer agent): fix critical → serious first (runtime findings give selector + html snippet; static give file:line:col), rerun the CLI after each batch, and repeat until `verdict != fail`; then redo the manual pass on changed pages. Pass `--baseline <previous report.json>` on re-runs — the report then classifies findings as **new / persisting / fixed**, which is your progress signal and catches regressions your fixes introduce. The CLI's exit code makes this loopable in CI: `node src/cli.ts --repo . && echo gate-passed`.

## What not to do

- Do not eyeball contrast, ARIA, or alt text instead of running the tool — and do not run the tool and skip the manual pass. Both halves, always.
- Do not claim compliance, "fully accessible", or "meets WCAG 2.2 AA". Report violations found, checks passed, and gaps.
- Do not gate on `score`; gate on `verdict` + manual results.
- Do not evaluate only the homepage. Crawl, seed SPA routes explicitly, and list uncovered routes under Gaps.
- Do not mark a manual criterion `pass` without stating what you inspected. Unverifiable → `needs-expert`, not `pass`.
- Do not dismiss `horizontal-overflow-320` or static-only findings without saying why (exempt content / component not on a crawled page).
- Do not "fix" a finding by deleting the element or hiding it from assistive tech (`aria-hidden`, `display:none`, removing focusability) unless it is genuinely decorative.

## Evaluation completion checklist

- [ ] CLI ran successfully (exit 0/1, not 2) on repo and/or seeded URLs
- [ ] Important routes covered (crawl + explicit seeds); uncovered ones listed in Gaps
- [ ] All automated findings reported with selectors/locations, none silently dropped
- [ ] All 16 manual criteria dispositioned with evidence (content signals used for N/A justifications)
- [ ] axe `incomplete` items re-checked on affected pages
- [ ] Final verdict merges automated + manual; Gaps section present
- [ ] Fix recommendations grounded in the report's `remediationPlan` (grouped by root cause, pitfalls respected), with source locations in repo mode
- [ ] No compliance claim anywhere in the deliverable
