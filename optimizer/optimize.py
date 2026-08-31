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

from metric import score
from trainset import build_trainset

ROOT = Path(__file__).resolve().parent.parent
SKILL_PATH = ROOT / "skills" / "a11y-fixer" / "SKILL.md"
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

    instructions = optimized.predictors()[0].signature.instructions
    out_path = ROOT / "optimizer" / "optimized-instructions.md"
    out_path.write_text(instructions, encoding="utf-8")
    print(f"\noptimized instructions saved to {out_path}")

    if args.apply:
        write_optimized_instructions(Path(args.skill), instructions)
        print(f"spliced into {args.skill} between the OPTIMIZED-INSTRUCTIONS markers.")
        print("Review the diff, then re-run the fixer on a fixture to confirm the improvement before committing.")
    else:
        print("run again with --apply to write them into the skill (or splice manually after review).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="exercise the metric with zero LM calls")
    parser.add_argument("--skill", default=str(SKILL_PATH), help="skill file with OPTIMIZED-INSTRUCTIONS markers")
    parser.add_argument("--model", default="anthropic/claude-sonnet-5", help="litellm model id for fixing + reflection")
    parser.add_argument("--auto", default="light", choices=["light", "medium", "heavy"], help="GEPA budget")
    parser.add_argument("--page", action="append", default=[], help="extra broken HTML page(s) to train on (repeatable)")
    parser.add_argument("--apply", action="store_true", help="write optimized instructions back into the skill")
    args = parser.parse_args()
    return dry_run() if args.dry_run else optimize(args)


if __name__ == "__main__":
    raise SystemExit(main())
