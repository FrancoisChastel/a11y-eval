"""The optimization metric: a11y-eval's deterministic score, plus a feature-preservation guard.

Stdlib-only on purpose — the metric (and --dry-run) must work without dspy installed.
score() returns (score in [0, 1], feedback string). The feedback quotes the evaluator's
actual findings so a reflective optimizer (GEPA) learns from real failure modes, and the
guard makes "delete the content" a losing strategy, not a shortcut.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

PRESERVATION_THRESHOLD = 0.85
EVAL_TIMEOUT_SECONDS = 120


def visible_text_tokens(html: str) -> set[str]:
    """Lowercased word tokens of user-visible text (tags, scripts, and styles stripped)."""
    stripped = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    stripped = re.sub(r"<[^>]+>", " ", stripped)
    return {t for t in re.findall(r"[a-zA-Z][a-zA-Z0-9']+", stripped.lower()) if len(t) > 2}


def preservation_ratio(original_html: str, fixed_html: str) -> float:
    original = visible_text_tokens(original_html)
    if not original:
        return 1.0
    kept = visible_text_tokens(fixed_html)
    return len(original & kept) / len(original)


def run_a11y_eval(html: str, a11y_eval_root: Path) -> dict:
    """Writes the candidate HTML to a temp file and runs the evaluator on it."""
    with tempfile.TemporaryDirectory(prefix="a11y-opt-") as tmp:
        page = Path(tmp) / "candidate.html"
        page.write_text(html, encoding="utf-8")
        out_dir = Path(tmp) / "report"
        subprocess.run(
            ["node", "src/cli.ts", "--url", str(page), "--out", str(out_dir)],
            cwd=a11y_eval_root,
            capture_output=True,
            timeout=EVAL_TIMEOUT_SECONDS,
            check=False,  # exit 1 = findings exist; still a valid evaluation
        )
        report_path = out_dir / "report.json"
        if not report_path.exists():
            raise RuntimeError("a11y-eval produced no report.json — is the checkout installed (pnpm install + playwright)?")
        return json.loads(report_path.read_text(encoding="utf-8"))


def findings_feedback(report: dict, limit: int = 8) -> str:
    lines = []
    for f in report.get("findings", [])[:limit]:
        target = (f.get("targets") or ["?"])[0]
        lines.append(f"- [{f['impact']}] {f['ruleId']} at {target}: {f['description']}")
    remaining = len(report.get("findings", [])) - limit
    if remaining > 0:
        lines.append(f"- …and {remaining} more finding(s)")
    return "\n".join(lines)


def score(original_html: str, fixed_html: str, a11y_eval_root: Path) -> tuple[float, str]:
    """The objective: evaluator score scaled to [0,1], zeroed if content was destroyed."""
    if not fixed_html or not fixed_html.strip().lower().startswith(("<!doctype", "<html")):
        return 0.0, "Output is not a complete HTML document — return the full fixed page, doctype included."

    ratio = preservation_ratio(original_html, fixed_html)
    if ratio < PRESERVATION_THRESHOLD:
        return 0.0, (
            f"Feature-preservation guard failed: only {ratio:.0%} of the original visible text survives "
            f"(threshold {PRESERVATION_THRESHOLD:.0%}). Deleting or hiding content is a failed fix — "
            "keep every capability and all text while fixing the accessibility issues."
        )

    report = run_a11y_eval(fixed_html, a11y_eval_root)
    value = report["score"] / 100
    if report["verdict"] == "pass":
        feedback = f"All automated checks pass (score {report['score']}/100, text preserved {ratio:.0%})."
    else:
        feedback = (
            f"Score {report['score']}/100, verdict {report['verdict']} (text preserved {ratio:.0%}). "
            f"Remaining violations to eliminate:\n{findings_feedback(report)}"
        )
    return value, feedback
