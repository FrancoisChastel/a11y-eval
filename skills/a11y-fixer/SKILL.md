---
name: a11y-fixer
description: Fix front-end accessibility issues from an a11y-eval mitigation work order (mitigations.md) — apply minimal, semantics-first patches to HTML/JSX/CSS, honor the binding anti-fix pitfalls, and verify every batch with a baseline re-run. Use when asked to fix accessibility findings, execute a mitigations.md work order, or remediate WCAG violations in a repo.
version: 1.0.0
license: MIT
---

# Accessibility Fixer

You are executing accessibility fixes. Your input is a **mitigation work order** (`mitigations.md`, produced by [a11y-eval](https://github.com/FrancoisChastel/a11y-eval)); your output is minimal source changes that make the findings disappear **for real users**, verified by re-running the evaluator.

If no work order exists yet, generate one first: `node src/cli.ts --repo <dir>` (or `--url` for a running app) in an a11y-eval checkout, or `node src/cli.ts mitigate --report <dir>` from an existing report.

## Fixing instructions

<!-- OPTIMIZED-INSTRUCTIONS:START — this block is the optimization target managed by optimizer/optimize.py; manual edits here are overwritten by --apply -->

Fix accessibility violations with the smallest change that restores real access, in this order of preference:

1. **Native semantics first.** Replace fake widgets with real elements: `div onclick` → `<button type="button">`, navigation `span` → `<a href>`, unlabeled input → `<label for>` + input. Native elements bring keyboard operability, roles, names, and states for free — ARIA retrofits are the fallback, never the first move.
2. **Content over attributes.** Alt text, labels, link text, and error messages must convey the actual information ("Q3 revenue up 12%"), not restate the element ("chart", "image", "link"). Write it from the surrounding context; flag for a human if the meaning is not inferable.
3. **Fix at the token/component level.** When the same rule fires across pages, find the shared cause — a CSS custom property, a base component, a layout wrapper — and fix it once. Never patch forty call sites when one component is the root cause.
4. **Preserve everything the user could do or read.** Text content, interactive capabilities, and visual hierarchy must survive the fix. Deleting a feature, hiding an element (`display:none`, `aria-hidden`), or removing focusability to silence a finding is a failed fix.
5. **Contrast is arithmetic, not aesthetics.** Compute the ratio (≥4.5:1 normal text, ≥3:1 large text/UI components); pick the nearest passing shade of the intended hue rather than jumping to black/white.
6. **Focus must be visible everywhere.** Delete blanket `outline: none`; add `:focus-visible` outlines (≥2px, offset, ≥3:1 against surroundings). Verify by tabbing.
7. **One work-order group per change-set.** Fix every listed instance of the group, then verify before starting the next. Batching unrelated groups makes regressions untraceable.
8. Every **Do NOT** in the work order is binding. When a fix and a pitfall conflict, the pitfall wins — stop and reconsider the approach.

<!-- OPTIMIZED-INSTRUCTIONS:END -->

## Workflow

1. **Read the work order** top to bottom. Groups are ordered by impact then reach — respect the order.
2. **Locate each instance in source**: static findings carry `file:line:col`; runtime findings carry a CSS selector and HTML snippet — grep the repo for the snippet, its class names, or nearby text.
3. **Apply the group's fix** to every instance, following the Fixing instructions above and the group's steps/pitfalls.
4. **Verify the batch**: re-run the work order's verification command (the original evaluation + `--baseline <previous report>`). The group is cleared when its rule appears under "fixed" with zero `new` findings.
5. **Manual-failure sections**: the reviewer's evidence is the specification. Derive the change from it, apply, and note that the criterion needs human/agent re-review — automation cannot confirm it.
6. **Stop conditions**: an instance whose meaning you cannot infer (alt text for an unknown image, a label for an ambiguous field) gets a `TODO(a11y)` comment plus a note in your summary — a wrong guess is worse than a flagged gap.
7. **Report**: score before → after, groups cleared, new findings (should be zero), items flagged for humans.

## VLM suspect groups

Work orders may contain `vlm-*` groups (only when the evaluation ran with `--vlm`). Their instance rows carry the vision model's reasoning — for `vlm-alt-quality-suspect`, a **proposed alt text**. Treat the proposal as a draft: verify it against the actual image before applying, and never apply a VLM-proposed change you cannot confirm from the page itself.

## What not to do

- FAIL: `tabindex` + key handlers bolted onto a `div` when a native element works
- FAIL: `alt=""` on informative images; `aria-label` duplicating visible text mismatches
- FAIL: suppressing rules, deleting elements, or `aria-hidden` to make findings disappear
- FAIL: eyeballed contrast tweaks without computing the ratio
- FAIL: claiming done without a verification re-run showing the rules gone

## Related skills

- `a11y-evaluator` — produces the report and work order this skill consumes
