import type { EvidencePacket, Finding, ManualReview, ManualReviewItem, Report } from '../types.ts'

export const DEFAULT_ADJUDICATION_MODEL = 'claude-haiku-4-5-20251001'

/** Criteria the LLM adjudicates; the rest resolve mechanically (signals) or stay needs-expert. */
const JUDGMENT_SCS = ['1.3.3', '1.4.1', '2.4.3', '2.4.6', '2.5.8', '3.1.2', '3.3.2']

export const buildAdjudicationPrompt = (report: Report): string => {
  const suspectsBySc = new Map<string, Finding[]>()
  for (const f of report.findings.filter((x) => x.confidence === 'suspect')) {
    for (const sc of f.wcag) suspectsBySc.set(sc, [...(suspectsBySc.get(sc) ?? []), f])
  }
  const packetsBySc = new Map<string, EvidencePacket[]>()
  for (const p of report.evidence ?? []) packetsBySc.set(p.sc, [...(packetsBySc.get(p.sc) ?? []), p])

  const sections = JUDGMENT_SCS.map((sc) => {
    const item = report.manualChecklist.find((c) => c.sc === sc)
    const suspects = (suspectsBySc.get(sc) ?? [])
      .map((s) => `  - suspect on ${s.page} at ${s.targets[0]}: ${s.description}`)
      .join('\n')
    const packets = (packetsBySc.get(sc) ?? [])
      .flatMap((p) => p.items.slice(0, 25).map((i) => `  - [${p.kind}] ${i.selector ?? ''} ${i.text ?? ''}`.trim()))
      .join('\n')
    return `### WCAG ${sc} — ${item?.name ?? ''}\nJudging rule: ${item?.how ?? ''}\nMachine suspects:\n${suspects || '  (none)'}\nEvidence:\n${packets || '  (none collected)'}`
  }).join('\n\n')

  return `You are adjudicating WCAG 2.2 AA manual criteria from machine-collected evidence. For each criterion below, decide: "pass" (evidence shows no violation), "fail" (evidence shows a violation), or "needs-expert" (evidence is insufficient or the call is genuinely uncertain). Be conservative: prefer needs-expert over a guessed pass. A criterion with confirmed suspects that clearly violate its judging rule is a fail.

${sections}

Respond with ONLY a JSON array, one object per criterion:
[{"sc": "1.3.3", "status": "pass|fail|needs-expert", "confidence": "high|low", "evidence": "one-sentence justification citing the specific evidence"}]`
}

/** Parses the model's JSON (low confidence → needs-expert) into review items. */
export const parseAdjudication = (responseText: string, validScs: string[]): ManualReviewItem[] => {
  const match = responseText.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Adjudication response contained no JSON array')
  const parsed = JSON.parse(match[0]) as { sc?: string; status?: string; confidence?: string; evidence?: string }[]
  const items: ManualReviewItem[] = []
  for (const entry of parsed) {
    if (!entry.sc || !validScs.includes(entry.sc)) continue
    const status =
      entry.status === 'pass' || entry.status === 'fail' || entry.status === 'needs-expert' ? entry.status : 'needs-expert'
    items.push({
      sc: entry.sc,
      status: entry.confidence === 'low' && status !== 'needs-expert' ? 'needs-expert' : status,
      evidence: entry.evidence?.slice(0, 500),
      method: 'llm',
    })
  }
  return items
}

const callAnthropic = async (prompt: string, model: string, apiKey: string): Promise<string> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = (await response.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Anthropic API returned no text content')
  return text
}

/**
 * LLM adjudication (--llm): dispositions the judgment criteria from the report's
 * suspects and evidence packets, resolves zero-signal criteria mechanically as
 * justified N/A, and marks everything else needs-expert. Returns a complete
 * ManualReview (reviewer "llm:<model>") ready for mergeManualReview — provenance
 * is preserved, and an LLM disposition is never silently equivalent to human
 * sign-off.
 */
export const adjudicate = async (report: Report, model = DEFAULT_ADJUDICATION_MODEL, apiKey?: string): Promise<ManualReview> => {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('LLM adjudication needs ANTHROPIC_API_KEY (or pass an api key).')

  const signalTotals = new Map<string, number>()
  for (const page of report.pages) {
    for (const [k, v] of Object.entries(page.signals ?? {})) signalTotals.set(k, (signalTotals.get(k) ?? 0) + v)
  }

  const llmItems = parseAdjudication(await callAnthropic(buildAdjudicationPrompt(report), model, key), JUDGMENT_SCS)
  const bySc = new Map(llmItems.map((i) => [i.sc, i]))

  const items: ManualReviewItem[] = report.manualChecklist.map((criterion) => {
    if (criterion.signal !== null && (signalTotals.get(criterion.signal) ?? 0) === 0) {
      return {
        sc: criterion.sc,
        status: 'not-applicable' as const,
        evidence: `No ${criterion.signal} content detected across ${report.pages.length} evaluated page(s) (content signals).`,
        method: 'signal-based' as const,
        autoSuggested: true,
      }
    }
    const llm = bySc.get(criterion.sc)
    if (llm) return llm
    return {
      sc: criterion.sc,
      status: 'needs-expert' as const,
      evidence: 'Not adjudicatable from machine evidence — requires human review.',
      method: 'llm' as const,
    }
  })

  return {
    reviewer: { name: `llm:${model}` },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    items,
  }
}
