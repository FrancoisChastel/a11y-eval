# Automatic skill improvement (DSPy/GEPA)

The a11y-fixer skill's "Fixing instructions" block is a prompt — which means it is a **program that can be optimized**, not just hand-edited. This repo ships the whole loop:

```
candidate instructions ──▶ LM fixes broken fixture pages ──▶ a11y-eval scores the result
        ▲                                                            │
        └────────── GEPA reflects on the evaluator's findings ◀──────┘
```

Three ingredients make this work here when it usually doesn't:

1. **An objective metric.** a11y-eval's 0-100 score is deterministic and cheap — no LLM judge, no vibes. `optimizer/metric.py` scales it to [0, 1].
2. **Textual feedback, not just a number.** The metric returns the evaluator's actual findings ("[critical] image-alt at img: Images must have alternative text") as GEPA's reflection input, so the optimizer learns *which* instruction gaps caused *which* failures.
3. **An anti-gaming guard.** The easiest way to score 100 is to delete the page. The metric zeroes any candidate that loses >15% of the original visible text, with feedback explaining why — so "hide the content" is a losing strategy the optimizer learns to avoid, exactly like the skill's own pitfall rules.

## Quickstart

```bash
# 0. Prereqs: the a11y-eval checkout works (pnpm install && npx playwright install chromium)

# 1. Verify the loops' scoring legs — no LM calls, no API key, CI-safe:
python3 optimizer/optimize.py --dry-run                       # fixer metric
python3 optimizer/optimize.py --target adjudicator --dry-run  # evaluator judgment metric

# 2. Full optimization (needs an LM — ANY provider, see below):
uv venv optimizer/.venv --python 3.12
uv pip install --python optimizer/.venv/bin/python -r optimizer/requirements.txt
echo 'ANTHROPIC_API_KEY=…' > optimizer/.env                   # gitignored; any provider's key works
optimizer/.venv/bin/python optimizer/optimize.py --auto light --apply                       # fixer
optimizer/.venv/bin/python optimizer/optimize.py --target adjudicator --auto light --apply  # evaluator
```

## The outcome is a skill

Every run emits a **complete, installable skill package** to `optimizer/out/<skill-name>/SKILL.md`: the full skill with the winning instructions spliced between the managed markers and provenance recorded in frontmatter — `optimized-at`, `optimized-model`, `optimized-target`, and `optimized-score` ("0.42 -> 0.87 (trainset avg, n=3)", measured by evaluating seed vs optimized program on the trainset). `--apply` copies that package over the live skill; without it, `cp -r optimizer/out/<skill-name> ~/.claude/skills/` installs it anywhere. Both optimization targets work this way:

| Target | Skill improved | Metric |
|---|---|---|
| `--target fixer` (default) | `skills/a11y-fixer` fixing instructions | a11y-eval score of the fixed page + content-preservation guard |
| `--target adjudicator` | `skills/a11y-evaluator` judgment principles (also loaded at runtime by `--llm`) | agreement with hand-labeled gold dispositions; a wrong "pass" on a gold "fail" is zeroed and flagged DANGEROUS |

## Any LLM provider

**Optimizer** (litellm model strings): `--model anthropic/claude-sonnet-5`, `--model openai/gpt-5-mini`, `--model gemini/gemini-2.5-pro`, `--model groq/llama-4`, `--model ollama_chat/llama3.1` (local, keyless)… Put the provider's key in `optimizer/.env` (`OPENAI_API_KEY=…`, `GEMINI_API_KEY=…`, etc. — all lines are loaded).

**CLI `--llm` adjudication** (zero-dependency, two wire formats): `anthropic/…` speaks the Anthropic Messages API; everything else speaks OpenAI Chat Completions — `openai/…`, `gemini/…`, `groq/…`, `mistral/…`, `deepseek/…`, `xai/…`, `openrouter/…`, `ollama/…` (localhost, keyless), or `openai-compat/<model>` with `A11Y_LLM_BASE_URL` pointing at any compatible endpoint (vLLM, LM Studio, a gateway). Keys come from the provider's usual env var or the `A11Y_LLM_API_KEY` override; `optimizer/.env` and `.env` are loaded automatically.

`--apply` rewrites only the block between the `OPTIMIZED-INSTRUCTIONS` markers in `skills/a11y-fixer/SKILL.md`; everything else in the skill (workflow, stop conditions, anti-patterns) is stable scaffolding. The pre-apply text is also saved to `optimizer/optimized-instructions.md` so you can diff before committing.

## Specializing for your own repo

The default trainset is this repo's broken fixtures. Your app fails differently — train on it:

1. Snapshot failing pages from your app (`curl` the URL, or save rendered HTML from DevTools) into files.
2. Add each with `--page`:

```bash
python3 optimizer/optimize.py --auto light --page snapshots/checkout.html --page snapshots/settings.html --apply
```

Each page gets its own work order built automatically (one evaluation per page), and the optimized instructions are selected for scoring well on **your** failure patterns, not just the fixtures. The easiest way to run this whole flow is the `skill-optimizer` agent (`agents/skill-optimizer.md`), which handles snapshotting, budgets, and the before/after comparison for a given repo.

## Cost and budget honesty

Every metric call = one LM fix generation + one browser evaluation (~10-20 s). GEPA's `--auto light` keeps this to a small multiple of the trainset size; `medium`/`heavy` multiply cost for diminishing returns on a 2-4 example set. Start light, add your own pages before adding budget — **better training data beats bigger budgets** for skill specialization.

## What this does NOT do

- It does not prove the skill is "good", it proves it scores better **on the trainset** — keep examples representative, and hold one page out for eyeballing.
- The metric only covers automated checks (~30-50% of WCAG). Instructions about manual criteria (alt-text *quality*, focus-order *meaning*) are preserved scaffolding, not optimized — humans still review those.
- It never runs against your production app. Fixes are applied to page snapshots in temp dirs; your repo is untouched unless you use the fixer skill separately.

## Files

| File | Role |
|---|---|
| `optimizer/optimize.py` | Entry point: `--dry-run` smoke test, GEPA loop, `--apply` splice-back |
| `optimizer/metric.py` | Stdlib-only metric: evaluator score + preservation guard + findings-as-feedback |
| `optimizer/trainset.py` | Builds examples (page HTML + generated work order); `--page` extends it |
| `optimizer/fixtures/flawed-fixed.html` | Hand-fixed reference proving a 1.0 is reachable (used by --dry-run and CI) |
| `optimizer/adjudicator.py` | Adjudicator target: gold-label agreement metric, browserless at scoring time |
| `optimizer/gold-adjudications.json` | Hand-labeled correct dispositions for the fixtures (we planted the issues) |
| `skills/a11y-fixer/SKILL.md` | Fixer target; the block between `OPTIMIZED-INSTRUCTIONS` markers is optimized |
| `skills/a11y-evaluator/SKILL.md` | Adjudicator target; its judgment block is also loaded at runtime by `--llm` |
