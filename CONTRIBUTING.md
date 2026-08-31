# Contributing to a11y-eval

Thanks for considering a contribution! This project is small on purpose — a deterministic evaluation core, a thin CLI, and an agent skill on top. Contributions that keep it small are the easiest to merge.

## Setup

Requires Node ≥ 23.6 (the code runs as TypeScript natively — no build step) and pnpm.

```bash
git clone https://github.com/FrancoisChastel/a11y-eval.git && cd a11y-eval
pnpm install
npx playwright install chromium
```

## Before opening a PR

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # unit tests (pure modules: scoring, wcag mapping, static merge, report, detect, crawl)

# Integration suite (the fixtures are the regression tests — CI runs these too):
node src/cli.ts --url test-fixtures/accessible-form.html                 # must pass, score 100
node src/cli.ts --url test-fixtures/flawed-form.html                     # must exit 1
node src/cli.ts --url test-fixtures/site/index.html --crawl              # must discover 3 pages
node src/cli.ts --repo test-fixtures/mini-app --no-crawl --url test-fixtures/site/page2.html
                                                                         # must yield 5 static findings
```

A good PR:

- **Adds or updates tests.** Pure logic gets a unit test; engine/CLI behavior gets a fixture the integration suite can assert on.
- **Updates `CHANGELOG.md`** under a new version heading (Keep a Changelog format, SemVer).
- **Uses conventional commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Keeps files small and focused** — one concern per module, no kitchen-sink utilities.

## Design rules worth knowing

- **Verdict gates on severity, never on score.** Anything that would let a critical/serious violation ship behind a good-looking score will be rejected.
- **No compliance claims.** The tool and the skill deliberately say "no known violations", never "compliant". Wording changes that weaken this are out of scope.
- **Static findings stay advisory** (moderate/minor). Runtime engines are the source of truth for what reaches the rendered page.
- **New runtime checks** belong in `src/engines/` and must state which WCAG SC they cover, their false-positive characteristics, and why axe-core doesn't already cover them.
- **The report JSON is a contract** consumed by agents. Additive changes are fine; renaming or removing fields is a breaking change and needs a major-version discussion first.

## Skill contributions

`skills/a11y-evaluator/SKILL.md` follows the [Agent Skills](https://agentskills.io) format. If you change the CLI or the report contract, update the skill in the same PR — it must never describe behavior the tool doesn't have.

## Releases (maintainers)

1. Bump `package.json` version + add the `CHANGELOG.md` entry
2. `git tag -a vX.Y.Z -m "…"` and push with `--follow-tags`
3. `gh release create vX.Y.Z`

## Conduct

Be kind, assume good faith, critique code not people. Accessibility work exists to include people — the project's collaboration should too.
