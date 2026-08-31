# Changelog

All notable changes to a11y-eval are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

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
