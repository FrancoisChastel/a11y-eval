"""Adjudicator optimization target: the evaluator skill's judgment instructions.

The metric needs no browser at scoring time: candidate instructions produce JSON
dispositions for fixture reports, scored against hand-labeled gold answers
(optimizer/gold-adjudications.json — we planted the fixtures' issues, so the
correct dispositions are known). Report generation (one-time, per trainset build)
does use the CLI. Stdlib-only.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

JUDGMENT_SCS = ["1.3.3", "1.4.1", "2.4.3", "2.4.6", "2.5.8", "3.1.2", "3.3.2"]
EVAL_TIMEOUT_SECONDS = 300

FIXTURE_RUNS: dict[str, list[str]] = {
    "wave1": ["--url", "test-fixtures/wave1.html"],
    "site": ["--url", "test-fixtures/site/index.html", "--crawl"],
    "accessible-form": ["--url", "test-fixtures/accessible-form.html"],
}


@dataclass
class AdjudicationExample:
    name: str
    criteria_context: str
    gold: dict[str, dict[str, list[str]]]


def generate_report(cli_args: list[str], a11y_eval_root: Path) -> dict:
    with tempfile.TemporaryDirectory(prefix="a11y-adj-") as tmp:
        out_dir = Path(tmp) / "report"
        subprocess.run(
            ["node", "src/cli.ts", *cli_args, "--out", str(out_dir)],
            cwd=a11y_eval_root,
            capture_output=True,
            timeout=EVAL_TIMEOUT_SECONDS,
            check=False,
        )
        return json.loads((out_dir / "report.json").read_text(encoding="utf-8"))


def build_criteria_context(report: dict) -> str:
    """Python port of buildAdjudicationPrompt's evidence sections (kept in sync by the round-trip smoke test)."""
    suspects_by_sc: dict[str, list[dict]] = {}
    for f in report.get("findings", []):
        if f.get("confidence") != "suspect":
            continue
        for sc in f.get("wcag", []):
            suspects_by_sc.setdefault(sc, []).append(f)
    packets_by_sc: dict[str, list[dict]] = {}
    for p in report.get("evidence", []):
        packets_by_sc.setdefault(p["sc"], []).append(p)
    checklist = {c["sc"]: c for c in report.get("manualChecklist", [])}

    sections = []
    for sc in JUDGMENT_SCS:
        item = checklist.get(sc, {})
        suspects = "\n".join(
            f"  - suspect on {s['page']} at {(s.get('targets') or ['?'])[0]}: {s['description']}"
            for s in suspects_by_sc.get(sc, [])
        )
        packets = "\n".join(
            f"  - [{p['kind']}] {i.get('selector', '')} {i.get('text', '')}".rstrip()
            for p in packets_by_sc.get(sc, [])
            for i in p.get("items", [])[:25]
        )
        sections.append(
            f"### WCAG {sc} — {item.get('name', '')}\nJudging rule: {item.get('how', '')}\n"
            f"Machine suspects:\n{suspects or '  (none)'}\nEvidence:\n{packets or '  (none collected)'}"
        )
    return "\n\n".join(sections)


def build_adjudicator_trainset(a11y_eval_root: Path) -> list[AdjudicationExample]:
    gold_all = json.loads((a11y_eval_root / "optimizer" / "gold-adjudications.json").read_text(encoding="utf-8"))
    examples = []
    for name, cli_args in FIXTURE_RUNS.items():
        print(f"  generating report for {name} …")
        report = generate_report(cli_args, a11y_eval_root)
        examples.append(AdjudicationExample(name=name, criteria_context=build_criteria_context(report), gold=gold_all[name]))
    return examples


def parse_response_items(text: str) -> dict[str, str]:
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        return {}
    try:
        entries = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    items: dict[str, str] = {}
    for entry in entries:
        if isinstance(entry, dict) and entry.get("sc") in JUDGMENT_SCS:
            status = entry.get("status")
            if entry.get("confidence") == "low" and status != "needs-expert":
                status = "needs-expert"
            items[entry["sc"]] = status if status in ("pass", "fail", "needs-expert") else "needs-expert"
    return items


def score_adjudication(response_text: str, gold: dict[str, dict[str, list[str]]]) -> tuple[float, str]:
    """Agreement with gold labels; a 'pass' where gold says 'fail' is the dangerous error."""
    predicted = parse_response_items(response_text)
    if not predicted:
        return 0.0, "Response contained no parseable JSON array of {sc, status, confidence, evidence} objects."

    total = 0.0
    notes: list[str] = []
    for sc, expectation in gold.items():
        status = predicted.get(sc)
        if status is None:
            notes.append(f"- {sc}: missing from the response (counts as wrong).")
            continue
        if status in expectation["gold"]:
            total += 1.0
        elif status in expectation.get("acceptable", []):
            total += 0.5
            notes.append(f"- {sc}: '{status}' is acceptable but the evidence supports '{expectation['gold'][0]}' — be more decisive when suspects clearly violate the judging rule.")
        else:
            if status == "pass" and "fail" in expectation["gold"]:
                notes.append(f"- {sc}: DANGEROUS — judged 'pass' but the evidence demonstrates a violation ('fail'). A wrong pass ships a barrier.")
            else:
                notes.append(f"- {sc}: judged '{status}' but gold is '{expectation['gold'][0]}'.")
    value = total / len(gold)
    feedback = f"Agreement {value:.2f} over {len(gold)} criteria." + ("\n" + "\n".join(notes) if notes else " All dispositions correct.")
    return value, feedback


def dry_run(a11y_eval_root: Path) -> int:
    print("adjudicator dry run: exercising the gold-label metric (no LM calls)…")
    gold = json.loads((a11y_eval_root / "optimizer" / "gold-adjudications.json").read_text(encoding="utf-8"))["wave1"]

    perfect = json.dumps([{ "sc": sc, "status": exp["gold"][0], "confidence": "high", "evidence": "x" } for sc, exp in gold.items()])
    p_score, _ = score_adjudication(perfect, gold)
    print(f"\nperfect response: score={p_score:.2f}")

    all_pass = json.dumps([{ "sc": sc, "status": "pass", "confidence": "high", "evidence": "x" } for sc in gold])
    a_score, a_feedback = score_adjudication(all_pass, gold)
    print(f"rubber-stamp all-pass: score={a_score:.2f}")
    print(a_feedback)

    garbage_score, _ = score_adjudication("I refuse.", gold)
    print(f"unparseable response: score={garbage_score:.2f}")

    ok = p_score == 1.0 and a_score < 0.7 and garbage_score == 0.0 and "DANGEROUS" in a_feedback
    print(f"\nadjudicator dry run {'PASSED' if ok else 'FAILED'}")
    return 0 if ok else 1
