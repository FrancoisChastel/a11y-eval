"""Builds the optimizer's training examples.

Each example = a broken page's HTML + the mitigation work order a11y-eval generates
for it. Defaults come from the repo's own fixtures; pass extra --page files (e.g.
snapshots of your own repo's failing pages) to specialize the skill for your codebase.
Stdlib-only.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from metric import EVAL_TIMEOUT_SECONDS

DEFAULT_FIXTURES = ["test-fixtures/site/flawed.html", "test-fixtures/flawed-form.html"]


@dataclass
class FixExample:
    name: str
    page_html: str
    work_order: str


def work_order_for(page: Path, a11y_eval_root: Path) -> str:
    with tempfile.TemporaryDirectory(prefix="a11y-train-") as tmp:
        out_dir = Path(tmp) / "report"
        subprocess.run(
            ["node", "src/cli.ts", "--url", str(page.resolve()), "--out", str(out_dir)],
            cwd=a11y_eval_root,
            capture_output=True,
            timeout=EVAL_TIMEOUT_SECONDS,
            check=False,
        )
        mitigations = out_dir / "mitigations.md"
        if not mitigations.exists():
            raise RuntimeError(f"Could not build a work order for {page}")
        return mitigations.read_text(encoding="utf-8")


def build_trainset(a11y_eval_root: Path, extra_pages: list[str]) -> list[FixExample]:
    pages = [a11y_eval_root / p for p in DEFAULT_FIXTURES] + [Path(p) for p in extra_pages]
    examples = []
    for page in pages:
        if not page.exists():
            raise FileNotFoundError(f"Training page not found: {page}")
        print(f"  building work order for {page.name} …")
        examples.append(
            FixExample(
                name=page.name,
                page_html=page.read_text(encoding="utf-8"),
                work_order=work_order_for(page, a11y_eval_root),
            )
        )
    return examples
