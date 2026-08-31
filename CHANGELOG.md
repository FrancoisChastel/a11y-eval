# Changelog

All notable changes to a11y-eval are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

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
