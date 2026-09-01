#!/usr/bin/env python3
"""Automatic skill improvement for the a11y-fixer skill, DSPy/GEPA-style.

The idea: the skill's "Fixing instructions" block is a prompt — a program. a11y-eval's
deterministic 0-100 score is an objective metric. So the skill can be *optimized*:
propose candidate instructions, have an LM fix broken fixture pages under each
candidate, score the fixes with the evaluator (feedback = the evaluator's actual
findings), and keep what measurably fixes more. The winning instructions are spliced
back into skills/a11y-fixer/SKILL.md between the OPTIMIZED-INSTRUCTIONS markers.

Modes:
  --dry-run           Exercise the metric leg with zero LM calls (CI-safe): the
                      unmodified flawed fixture must score low; a hand-fixed version
                      must score 1.0. Requires only Node + the a11y-eval install.
  (default)           Full GEPA optimization. Requires `pip install -r requirements.txt`
                      and an LM key (e.g. ANTHROPIC_API_KEY). Start with --auto light.

Usage:
  python3 optimizer/optimize.py --dry-run
  python3 optimizer/optimize.py --auto light --apply
  python3 optimizer/optimize.py --auto light --page snapshots/checkout.html --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from adjudicator import build_adjudicator_trainset, dry_run as adjudicator_dry_run, score_adjudication
from metric import score
from trainset import build_trainset

ROOT = Path(__file__).resolve().parent.parent
SKILL_PATH = ROOT / "skills" / "a11y-fixer" / "SKILL.md"
EVALUATOR_SKILL_PATH = ROOT / "skills" / "a11y-evaluator" / "SKILL.md"


def load_dotenv() -> None:
    """Loads optimizer/.env (gitignored) so the API key never has to live in a shell profile."""
    import os

    env_file = ROOT / "optimizer" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))
MARKER_RE = re.compile(
    r"(<!-- OPTIMIZED-INSTRUCTIONS:START[^>]*-->\n)(.*?)(\n<!-- OPTIMIZED-INSTRUCTIONS:END -->)", re.S
)


def read_seed_instructions(skill_path: Path) -> str:
    match = MARKER_RE.search(skill_path.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError(f"No OPTIMIZED-INSTRUCTIONS markers in {skill_path}")
    return match.group(2).strip()


def write_optimized_instructions(skill_path: Path, instructions: str) -> None:
    content = skill_path.read_text(encoding="utf-8")
    updated = MARKER_RE.sub(lambda m: f"{m.group(1)}\n{instructions.strip()}\n{m.group(3)}", content, count=1)
    skill_path.write_text(updated, encoding="utf-8")


FRONTMATTER_RE = re.compile(r"^(---\n)(.*?)(\n---\n)", re.S)


def emit_skill_package(skill_path: Path, instructions: str, meta: dict[str, str], out_root: Path) -> Path:
    """The optimization outcome is a complete, installable skill: the full SKILL.md
    with the optimized block spliced in and provenance recorded in frontmatter."""
    content = skill_path.read_text(encoding="utf-8")
    content = MARKER_RE.sub(lambda m: f"{m.group(1)}\n{instructions.strip()}\n{m.group(3)}", content, count=1)

    fm = FRONTMATTER_RE.match(content)
    if fm:
        body = fm.group(2)
        for key, value in meta.items():
            line = f"{key}: {value}"
            key_re = re.compile(rf"^{re.escape(key)}:.*$", re.M)
            body = key_re.sub(line, body) if key_re.search(body) else body + "\n" + line
        content = fm.group(1) + body + fm.group(3) + content[fm.end():]

    out_dir = out_root / skill_path.parent.name
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "SKILL.md"
    out_path.write_text(content, encoding="utf-8")
    return out_path


def evaluate_program(program, trainset, gepa_metric) -> float:
    """Average metric score of a program over the trainset (for before/after provenance)."""
    import dspy

    plain_metric = lambda gold, pred, trace=None: float(gepa_metric(gold, pred).score)
    result = dspy.Evaluate(devset=trainset, metric=plain_metric, num_threads=1, display_progress=False)(program)
    return round(float(result.score) / 100, 3)


def finish_run(args, skill_path: Path, program, optimized, trainset, gepa_metric, target: str, notes_path: Path) -> int:
    from datetime import datetime, timezone

    print("scoring seed vs optimized on the trainset…")
    before = evaluate_program(program, trainset, gepa_metric)
    after = evaluate_program(optimized, trainset, gepa_metric)

    instructions = optimized.predictors()[0].signature.instructions
    notes_path.write_text(instructions, encoding="utf-8")

    meta = {
        "optimized-at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "optimized-model": args.model,
        "optimized-target": target,
        "optimized-score": f'"{before} -> {after} (trainset avg, n={len(trainset)})"',
    }
    package = emit_skill_package(skill_path, instructions, meta, ROOT / "optimizer" / "out")
    print(f"\nOUTCOME — optimized skill package: {package}")
    print(f"trainset score: {before} -> {after}")

    if args.apply:
        skill_path.write_text(package.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"applied: {skill_path} now carries the optimized instructions + provenance frontmatter.")
    else:
        print(f"install it with --apply, or copy {package.parent} into ~/.claude/skills/ as-is.")
    return 0


def dry_run() -> int:
    print("dry run: exercising the metric leg (no LM calls)…")
    flawed = (ROOT / "test-fixtures" / "site" / "flawed.html").read_text(encoding="utf-8")
    fixed = (ROOT / "optimizer" / "fixtures" / "flawed-fixed.html").read_text(encoding="utf-8")

    identity_score, identity_feedback = score(flawed, flawed, ROOT)
    print(f"\nidentity candidate (no fix applied): score={identity_score:.2f}")
    print(identity_feedback)

    fixed_score, fixed_feedback = score(flawed, fixed, ROOT)
    print(f"\nhand-fixed candidate: score={fixed_score:.2f}")
    print(fixed_feedback)

    guard_score, guard_feedback = score(flawed, "<!doctype html><html lang='en'><head><title>x</title></head><body></body></html>", ROOT)
    print(f"\ncontent-deleted candidate: score={guard_score:.2f}")
    print(guard_feedback)

    ok = fixed_score >= 0.99 and identity_score <= 0.7 and guard_score == 0.0
    print(f"\ndry run {'PASSED' if ok else 'FAILED'}: hand-fixed must reach 1.0, identity must stay low, deletion must score 0.")
    return 0 if ok else 1


def optimize_adjudicator(args: argparse.Namespace) -> int:
    try:
        import dspy
    except ImportError:
        print("dspy is not installed. Run: uv pip install -r optimizer/requirements.txt", file=sys.stderr)
        return 2

    skill_path = Path(args.skill) if args.skill else EVALUATOR_SKILL_PATH
    seed = read_seed_instructions(skill_path)
    print(f"seed judgment instructions: {len(seed)} chars from {skill_path}")
    print("building adjudicator trainset (one evaluation per fixture)…")
    examples = build_adjudicator_trainset(ROOT)

    signature = dspy.Signature(
        {
            "criteria_context": (str, dspy.InputField(desc="WCAG criteria with judging rules, machine suspects, and collected evidence")),
            "adjudications_json": (str, dspy.OutputField(desc='JSON array only: [{"sc","status":"pass|fail|needs-expert","confidence":"high|low","evidence"}]')),
        },
        seed,
    )
    program = dspy.ChainOfThought(signature)
    dspy.configure(lm=dspy.LM(args.model, max_tokens=8000))

    gold_by_context = {e.criteria_context: e.gold for e in examples}

    def gepa_metric(gold_example, pred, trace=None, pred_name=None, pred_trace=None):
        gold = gold_by_context[gold_example.criteria_context]
        value, feedback = score_adjudication(pred.adjudications_json or "", gold)
        return dspy.Prediction(score=value, feedback=feedback)

    trainset = [dspy.Example(criteria_context=e.criteria_context).with_inputs("criteria_context") for e in examples]

    optimizer = dspy.GEPA(
        metric=gepa_metric,
        auto=args.auto,
        reflection_lm=dspy.LM(args.model, temperature=1.0, max_tokens=8000),
        track_stats=True,
    )
    optimized = optimizer.compile(program, trainset=trainset, valset=trainset)
    return finish_run(args, skill_path, program, optimized, trainset, gepa_metric, "adjudicator", ROOT / "optimizer" / "optimized-judgment-instructions.md")


def optimize(args: argparse.Namespace) -> int:
    try:
        import dspy  # imported lazily: --dry-run must not require it
    except ImportError:
        print("dspy is not installed. Run: pip install -r optimizer/requirements.txt", file=sys.stderr)
        return 2

    seed = read_seed_instructions(Path(args.skill))
    print(f"seed instructions: {len(seed)} chars from {args.skill}")
    print("building trainset (one evaluation per page)…")
    examples = build_trainset(ROOT, args.page)

    signature = dspy.Signature(
        {
            "work_order": (str, dspy.InputField(desc="a11y-eval mitigation work order for this page")),
            "page_html": (str, dspy.InputField(desc="the current, broken HTML page")),
            "fixed_html": (str, dspy.OutputField(desc="the complete fixed HTML document, nothing else")),
        },
        seed,
    )
    program = dspy.ChainOfThought(signature)
    dspy.configure(lm=dspy.LM(args.model, max_tokens=16000))

    def gepa_metric(gold, pred, trace=None, pred_name=None, pred_trace=None):
        value, feedback = score(gold.page_html, pred.fixed_html or "", ROOT)
        return dspy.Prediction(score=value, feedback=feedback)

    trainset = [
        dspy.Example(work_order=e.work_order, page_html=e.page_html).with_inputs("work_order", "page_html")
        for e in examples
    ]

    optimizer = dspy.GEPA(
        metric=gepa_metric,
        auto=args.auto,
        reflection_lm=dspy.LM(args.model, temperature=1.0, max_tokens=16000),
        track_stats=True,
    )
    optimized = optimizer.compile(program, trainset=trainset, valset=trainset)
    return finish_run(args, Path(args.skill), program, optimized, trainset, gepa_metric, "fixer", ROOT / "optimizer" / "optimized-instructions.md")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", default="fixer", choices=["fixer", "adjudicator"], help="which skill to optimize: the a11y-fixer instructions or the evaluator's judgment instructions")
    parser.add_argument("--dry-run", action="store_true", help="exercise the metric with zero LM calls")
    parser.add_argument("--skill", default=None, help="skill file with OPTIMIZED-INSTRUCTIONS markers (default depends on --target)")
    parser.add_argument("--model", default="anthropic/claude-sonnet-5", help="litellm model id for fixing + reflection")
    parser.add_argument("--auto", default="light", choices=["light", "medium", "heavy"], help="GEPA budget")
    parser.add_argument("--page", action="append", default=[], help="extra broken HTML page(s) to train on (repeatable)")
    parser.add_argument("--apply", action="store_true", help="write optimized instructions back into the skill")
    args = parser.parse_args()
    load_dotenv()
    if args.target == "adjudicator":
        return adjudicator_dry_run(ROOT) if args.dry_run else optimize_adjudicator(args)
    if args.skill is None:
        args.skill = str(SKILL_PATH)
    return dry_run() if args.dry_run else optimize(args)


if __name__ == "__main__":
    raise SystemExit(main())
