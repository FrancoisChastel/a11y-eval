# Changelog

All notable changes to a11y-eval are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

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
