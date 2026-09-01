# Changelog

All notable changes to a11y-eval are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

## [0.9.0] - 2026-08-31

### Added

- **Any LLM provider as backend.** CLI `--llm` now takes `provider/model` — Anthropic Messages wire for `anthropic/…`, OpenAI Chat Completions wire for `openai/…`, `gemini/…`, `groq/…`, `mistral/…`, `deepseek/…`, `xai/…`, `openrouter/…`, `ollama/…` (local, keyless), and `openai-compat/<model>` + `A11Y_LLM_BASE_URL` for any compatible endpoint (vLLM, LM Studio, gateways). Keys via the provider's usual env var or `A11Y_LLM_API_KEY`; gitignored `optimizer/.env` / `.env` loaded automatically. The optimizer accepts any litellm `--model` likewise.
- **The optimization outcome is a skill.** Both optimizer targets emit a complete installable package to `optimizer/out/<skill-name>/SKILL.md` — full skill, optimized block spliced, provenance frontmatter (`optimized-at/model/target/score` with before→after trainset average from evaluating seed vs optimized). `--apply` promotes the package to the live skill.
- CI: skill-package emission check; provider-resolution unit tests (70 total).

## [0.8.0] - 2026-08-31

### Added

- **Suspect confidence tier**: machine-flagged candidates (`confidence: "suspect"`) pre-fill the review UI with quotes and screenshots but never gate the verdict — unless **`--strict`** promotes them. False positives can't break CI trust.
- **Wave-1 deterministic engines** shrinking the manual checklist: target-size geometry with spacing/inline/UA exceptions and label unions (2.5.8), on-focus context-change detection (3.2.1, violations), Tab-cycle trap and tab-order upward-jump detection (2.1.2/2.4.3), sensory-phrase lexicon (1.3.3), offline language detection via franc with a fit-gap guard (3.1.2), caption-track presence (1.2.2), custom-slider keyboard operability (2.5.7/2.1.1, violations), and an Esc-dismissability hover probe (1.4.13, violations).
- **Evidence packets** (`report.evidence`): headings, labels with their controls, media inventory, and the full tab-order trace — rendered per criterion in the review UI alongside suspects; suspect element screenshots captured to `evidence/`.
- **`--llm [model]` adjudication**: judgment criteria dispositioned from the evidence packets via the Anthropic API (no SDK), auto-merged as reviewer `llm:<model>`; low-confidence → needs-expert. Zero-signal criteria resolve mechanically as justified N/A.
- **`--interact` probes** (staging only, loud warning): on-input navigation detection (3.2.2) and dialog Escape-trap probing (2.1.2).
- `data-a11y-eval-ignore` attribute excludes an element's text from sensory/language checks; the review UI applies it to its own quoting sections.
- `test-fixtures/wave1.html` exercising every new check; CI asserts all planted rules fire, strict-mode gating semantics, and that the dogfooded review UI stays at zero suspects.
- Remediation catalog entries for the new violation rules; checklist items now carry an `automation` tier (`checked`/`suspects`/`evidence`/`none`).

### Fixed

- Native date/time inputs' internal focus segments no longer misread as keyboard traps; default-sized text inputs exempted from target-size (UA-determined size exception).

## [0.7.0] - 2026-08-31

### Added

- **a11y-fixer skill** (`skills/a11y-fixer/SKILL.md`): executes mitigation work orders with minimal, semantics-first patches; its core instruction block sits between machine-managed `OPTIMIZED-INSTRUCTIONS` markers.
- **Automatic skill improvement** (`optimizer/`): DSPy/GEPA loop using a11y-eval's deterministic score as the metric — candidate instructions fix broken fixtures, the evaluator scores each fix, its findings feed GEPA's reflection, and a feature-preservation guard (≥85% visible text retained) zeroes delete-to-pass candidates. Winning instructions are spliced back into the skill with `--apply`. `--dry-run` exercises the metric leg with zero LM calls; `--page` trains on snapshots of your own repo's failing pages.
- `docs/skill-optimization.md` (how the loop works, cost honesty, bring-your-own-repo) and `agents/skill-optimizer.md` (one-flow agent for a given repo: baseline → snapshot → optimize → prove the delta).
- CI runs the optimizer dry run (no LM spend).

## [0.6.0] - 2026-08-31

### Added

- **Explainable score**: `scoreBreakdown` in the report (per-rule instances, the 5-per-rule-per-page cap made visible, points deducted) rendered as a "Score breakdown" table in report.md with a visual score bar; **per-page scores** in `pages[].score`, report.md headings, and the review UI.
- **CLI summary block**: evaluations and merges now end with a human-readable summary — score with bar, result, severity counts, pages, baseline delta, top fix, output paths — followed by the machine-parseable `key=value` line.
- CLI demo GIF regenerated for the new output.

## [0.5.0] - 2026-08-31

### Added

- **`mitigations.md` — agent-executable work order**, written automatically by every evaluation and every merge (CLI and review-UI finalize), regenerable on demand with the **`mitigate` subcommand** (prefers `final-report.json` so manual failures are included). Contains rules of engagement, per-group fix/steps/before-after/pitfalls/docs, **every instance** (selector + html snippet, or `file:line:col` for static), evidence-driven sections for manual-review failures, a needs-expert list, and the exact verification command (original invocation + `--baseline`, recorded as `meta.command`).
- Skill Phase 5 now consumes the work order instead of re-deriving it.
- CI asserts the work order's content in both automatic and manual modes.

### Changed

- **`report.md` restructured**: at-a-glance table (result, pages, engines, baseline, fix groups, manual-review state), Top fixes summary (details moved to mitigations.md), per-page findings, content-signals table, **Gaps — what this report does NOT cover** (static-scan state, axe incompletes, undispositioned/undocumented criteria, crawl coverage), and a Next steps section with concrete commands.

## [0.4.0] - 2026-08-31

### Added

- **Human review UI** (`review.html`, written by every evaluation): self-contained page for completing the manual half of the evaluation — all 16 criteria with per-criterion procedures, status/evidence/affected-pages/severity capture, optional reviewer feedback (assistive tech, browser, method). Static mode persists to localStorage with export/import; **served mode** (`a11y-eval review`) adds autosave, Playwright-powered element evidence screenshots, and one-click finalize-merge. Loopback-only server; screenshot endpoint restricted to evaluated URLs.
- **Content signals** (`pages[].signals`): runtime detection of media, form controls, drag affordances, hover-revealed content, foreign-language parts, and iframes. The review UI suggests justified auto-N/A when a criterion's signal is absent and warns when N/A contradicts detected signals.
- **`merge` subcommand**: combines a manual review into a final report with a merged `overall` verdict (`fail` / `issues` / `no-known-violations`), human findings entering scoring, and undocumented dispositions surfaced. Exit 1 on overall fail.
- **Remediation catalog + `remediationPlan`**: deterministic fix guidance (steps, good/bad examples, effort, pitfalls) for custom and high-frequency rules; findings grouped by root cause, ordered by impact then reach, rendered in report.md and the review UI.
- **`--baseline` diff**: classifies findings as new / persisting / fixed across runs (origin-insensitive fingerprints), lists fixed findings, and carries a baseline's manual review forward as review-UI prefill.
- Skill updated with Phase 5 (mitigation recommendations), content-signal usage, baseline loops, and human-review merge guidance.
- CI: dogfood gate (review.html must pass the tool's own evaluation), merge and baseline integration checks.

### Changed

- `Engine` type now includes `agent` and `human`; `ManualCheckItem` gains `how` (review procedure) and `signal` (applicability gate).

## [0.3.1] - 2026-08-31

### Added

- **CI workflow** (GitHub Actions): typecheck, unit tests, and the four fixture integration checks (accessible control passes, flawed page exits 1, crawl discovers 3 pages, repo-mode static scan finds the planted violations) on every push and PR.
- `CONTRIBUTING.md` (setup, test/fixture workflow, design rules, release process) and issue templates.
- README badges, contributing/license/acknowledgments sections; `homepage` and `bugs` package metadata.

## [0.3.0] - 2026-08-31

### Added

- **Agent skill** (`skills/a11y-evaluator/SKILL.md`): harness-agnostic Agent Skills package covering the full evaluation process — CLI recipes, report-contract semantics, per-criterion LLM manual-review procedures for the 16 automation blind spots, deliverable template with mandatory Gaps section, and anti-compliance-claim rules.
- **Claude Code subagent** (`agents/a11y-evaluator.md`) wrapping the skill.
- README section documenting skill installation for Claude Code and other harnesses.

## [0.2.0] - 2026-08-31

### Added

- **Repo mode** (`--repo <dir>`): framework/package-manager detection (Next, Angular, Svelte, Vue, CRA, Vite), dev-server start with process-group cleanup (`--start-cmd`, `--port`), and automatic crawling.
- **Crawler**: breadth-first same-origin page discovery from seed URLs (`--crawl`, `--max-pages`, `--max-depth`); same-directory scoping for `file://` seeds; skips anchors, external origins, `mailto:`/`javascript:` links, and asset URLs.
- **Static source scan**: runs the repo's own ESLint when configured, with a bundled `eslint-plugin-jsx-a11y` flat-config fallback for JSX/TSX; findings mapped to `file:line:col`.
- `meta` block in the report (repo, framework, static-scan mode, crawl seeds).
- Self-contained integration fixtures (`test-fixtures/`): multi-page crawl site, flawed/accessible form pair, mini React app with planted jsx-a11y violations.

### Fixed

- Pinned TypeScript to 5.9.x — `@typescript-eslint/parser` does not support TS 7, which silently broke the bundled static scan.

## [0.1.0] - 2026-08-31

### Added

- Core evaluation function `evaluate({urls}) → Report` and CLI with `report.json` + `report.md` output.
- Runtime engines: axe-core (WCAG 2.0/2.1/2.2 A+AA rulesets) via `@axe-core/playwright`; custom Playwright checks for keyboard operability (2.1.1), visible focus (2.4.7), and 320px reflow (1.4.10).
- Severity-gated verdict (`pass` / `pass-with-issues` / `fail`) with CI exit codes; instance-capped 0-100 score.
- WCAG tag → success-criterion mapping; 16-item manual-review checklist for automation blind spots.
- `--static-report` merge of external ESLint JSON output.
