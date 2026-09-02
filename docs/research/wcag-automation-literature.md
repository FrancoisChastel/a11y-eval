# What the literature says about automating WCAG and scoring accessibility

Deep-research synthesis (2026-09-01) informing a11y-eval's design. Provenance is marked per claim:
**[verified]** survived a 3-vote adversarial verification panel (vote shown); **[unverified]** was
extracted from a primary source but its verification pass was cut short by a usage limit — treat as
credible-but-unaudited, especially where the source is W3C's own text.

## 1. How much of WCAG can be automated

- **[verified 3-0]** In practice, automated tools report violations for only about **one sixth of all WCAG success criteria**, and for most tools the median number of unique violated SC per page is **two or less** — automated conformance results systematically understate WCAG's scope. (Universal Access in the Information Society, 2025 — https://link.springer.com/article/10.1007/s10209-025-01263-x)
- **[verified 2-1]** Abu Doush et al. (as cited in the same venue): **44%** of SC can be automatically evaluated, **43%** can only be tool-*supported* for human experts, and only **13%** are predicted reliably assessable by tools alone.
- **[unverified — GDS]** The UK Government Digital Service seeded one page with **142 known barriers** and ran 13 tools: the best detected **40%**, the worst **13%**.
- **[verified 3-0]** The AAA framework (AAAI 2026 AISI, https://arxiv.org/abs/2511.03471) operationalizes W3C's WCAG-EM as a **human-AI partnership** — crawl, automated checks (axe-core + AI checkers), representative sampling, MLLM-assisted manual checks, reporting — explicitly *not* full automation.
- **[verified 3-0]** Same paper: hard-coded checkers detect only **syntactic** issues; contextual/semantic aspects require humans; MLLMs are **copilots for high-effort manual tasks, not replacements for auditors**.
- **[unverified — W3C WCAG-EM 2.0, Group Note 2026-07-23]** Most WCAG checks cannot be fully automated; tools assist human evaluators.
- **[unverified — W3C ACT]** ACT rule outcomes are **asymmetric evidence**: a *failed* outcome proves the requirement is not satisfied, but *passed/inapplicable* outcomes can never prove a criterion is satisfied. Rule engines can demonstrate non-conformance, never conformance.

**Implication for a11y-eval:** our coverage note ("automated checks cover roughly 30-50% of WCAG") sits between the observed reality (~1/6 of SC actually reported on) and the theoretical ceiling (44% automatable). It should cite both figures and add the ACT asymmetry sentence — a clean run proves *absence of detected failures*, not conformance. Our iron rule (never claim compliance) is exactly the literature's position.

## 2. Scoring accessibility: metrics and their criticisms

- **[verified 3-0]** W3C's RDWG *Research Report on Web Accessibility Metrics* defines the five quality criteria any metric must be judged against: **validity, reliability, sensitivity, adequacy, complexity** — validity meaning scores reflect actual accessibility for users. (https://www.w3.org/TR/accessibility-metrics-report/)
- **[verified 3-0]** A benchmarking survey cited there found existing automated conformance metrics (WAQM, UWEM, failure rate) **divergent**, and most **fail to discriminate accessible from non-accessible pages**.
- **[verified 3-0]** The report names the metrics' **major weakness**: they inherit the tools' false positives/negatives — tool coverage bias propagates into any downstream score.
- **[verified 3-0 / 2-0]** Freire et al. (SIGDOC 2008, https://dl.acm.org/doi/pdf/10.1145/1456536.1456551): **no single metric is universally appropriate**; metric choice should match the project. Early validation compared metrics against each other, not against expert judgments or user outcomes.
- **[unverified — W3C]** No single aggregated accessibility metric currently meets the required reliability/accuracy/practicality; **aggregated scores can be misleading without context**.
- **[unverified — WCAG 3.0 Working Draft, 2026-03]** WCAG 3.0's conformance direction is **Bronze/Silver/Gold requirement sets**, not a numeric score.

**Implication for a11y-eval:** the literature *validates our architecture and would criticize a misreading of it*. What we already do right: the verdict (severity-gated, requirement-style) is the gate, never the score; the score is documented as a progress metric; every report carries a Gaps section. What to tighten: (a) state in the report that the score measures **absence of detected failures under this tool's coverage**, is **not comparable across sites/tools**, and that its severity weights (15/10/3/1) are engineering judgment, not user-impact-validated; (b) our per-rule-per-page instance cap is a normalization choice akin to failure-rate metrics — defensible for regression tracking, unvalidated as "accessibility". Baseline-diff regression tracking is the use the literature supports best.

## 3. The LLM/VLM era — direct evidence for our tiered design

- **[verified 3-0]** An LLM auditor (GPT-4o reasoning over **screen-reader transcripts**) detected **69.2%** of expert-identified screen-reader errors vs **31.3%** for Google Accessibility Scanner (axe baseline 17.1% recall on that set) — LLM evaluation roughly **doubles rule-engine coverage** on contextual error types. (https://arxiv.org/abs/2504.02110)
- **[verified 3-0]** Same system's **precision was 71.3%** (~29% of LLM flags unconfirmed by experts; F1 .664) — the false-positive cost of LLM detection, quantified.
- **[verified 3-0]** Same paper: rule-based checkers produce **fewer false positives** than the LLM on error-free elements — the coverage gain trades against precision, which **supports architectures separating high-confidence rule violations from lower-confidence LLM 'suspects'**.
- **[verified 3-0]** On a 1,985-image benchmark for WCAG 2.2 SC 3.3.8/3.3.9, MLLMs achieve **near-perfect binary violation judgment** (fine-tuned 99.88%, GPT-4o 97.47%) but **weak fine-grained categorization** (best macro-F1 45.58). (https://arxiv.org/abs/2511.03471)
- **[unverified — W3C ACT Rules Format 1.0]** The spec's **'incomplete' outcome** (applicability automatable, expectation needs human judgment) is the standards-track analog of a suspects-vs-violations confidence tier.

**Implication for a11y-eval:** three design decisions now have published backing — (1) the **suspects tier** (rule violations gate, AI flags don't; matches both the precision data and ACT's 'incomplete'); (2) **binary per-criterion VLM questions** rather than taxonomy requests (matches the near-perfect-binary/weak-categorization result); (3) the planned **narration→LLM judging** (Layer 2) mirrors the transcript-based method that achieved 69.2% recall — proceed. The 71.3%-precision figure argues suspects must *stay* non-gating by default.

## 4. Adoption list (concrete changes)

1. **ACT/EARL outcome alignment** — document (and optionally emit) the mapping: violation → ACT `failed`, suspect → EARL `incomplete` (aka "cantTell"), clean check → `passed` with the asymmetry caveat. Positions our tiers on W3C vocabulary.
2. **Recalibrated coverage note** — cite observed (~1/6 SC reported) vs theoretical (44% automatable / 13% reliable) figures; add "a clean automated run demonstrates absence of detected failures, not conformance."
3. **Score honesty block** — one paragraph in report.md/README stating the RDWG framing: unvalidated weights, tool-coverage inheritance, no cross-site comparability; recommended use is baseline-to-baseline regression tracking.
4. **WCAG-EM 2.0 (2026-07) alignment** — the evaluator skill's process ≈ WCAG-EM steps; name the correspondence and note our crawler is *convenience* sampling, not WCAG-EM representative sampling (AAA's GRASP shows a learned-embedding alternative — future work).
5. **WCAG 3.0 watch** — Bronze/Silver/Gold requirement-set direction confirms verdict-first design; no numeric-score arms race.

## Research-run caveats

Adversarial verification was cut short by a session usage limit: 13 claims verified (votes shown), ~11 recovered unverified (mostly W3C primary text), one claim about a six-tool empirical study ended 0-1 with two errored votes and was dropped. One relevant-looking source each at ScienceDirect/Springer/Deque failed to fetch. A re-run can resume from the cached workflow (`resumeFromRunId: wf_f1549648-f5d`).
