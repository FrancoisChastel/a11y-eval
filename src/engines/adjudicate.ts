import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EvidencePacket, Finding, ManualReview, ManualReviewItem, Report } from '../types.ts'

export const DEFAULT_ADJUDICATION_MODEL = 'claude-haiku-4-5-20251001'

/** Criteria the LLM adjudicates; the rest resolve mechanically (signals) or stay needs-expert. */
export const JUDGMENT_SCS = ['1.3.3', '1.4.1', '2.4.3', '2.4.6', '2.5.8', '3.1.2', '3.3.2']

const FALLBACK_JUDGMENT_INSTRUCTIONS =
  'Adjudicate each criterion from the machine-collected evidence, deciding "pass", "fail", or "needs-expert". Be conservative: prefer needs-expert over a guessed pass. A criterion whose suspects clearly violate its judging rule is a fail. Quote the decisive evidence in every justification.'

const EVALUATOR_SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'a11y-evaluator', 'SKILL.md')
const MARKER_RE = /<!-- OPTIMIZED-INSTRUCTIONS:START[^>]*-->\n([\s\S]*?)\n<!-- OPTIMIZED-INSTRUCTIONS:END -->/

/**
 * The judgment instructions live in the evaluator skill between managed markers —
 * one text drives both the agent skill and --llm adjudication, and the DSPy
 * optimizer improves it in place. Falls back to a built-in seed when the skill
 * file is absent (e.g. the tool vendored without skills/).
 */
export const loadJudgmentInstructions = (skillPath = EVALUATOR_SKILL_PATH): string => {
  try {
    const match = MARKER_RE.exec(readFileSync(skillPath, 'utf8'))
    const text = match?.[1]?.trim()
    if (text) return text
  } catch {
    /* skill file not present */
  }
  return FALLBACK_JUDGMENT_INSTRUCTIONS
}

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

  return `You are adjudicating WCAG 2.2 AA manual criteria from machine-collected evidence.

${loadJudgmentInstructions()}

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

/** Wire format + endpoint + key-env for a provider. openai wire = Chat Completions, which most providers speak. */
interface ProviderPreset {
  wire: 'anthropic' | 'openai'
  baseUrl: string
  keyEnv: string | null
}

const PROVIDERS: Record<string, ProviderPreset> = {
  anthropic: { wire: 'anthropic', baseUrl: 'https://api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { wire: 'openai', baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY' },
  gemini: { wire: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY' },
  groq: { wire: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
  mistral: { wire: 'openai', baseUrl: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY' },
  deepseek: { wire: 'openai', baseUrl: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY' },
  xai: { wire: 'openai', baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY' },
  openrouter: { wire: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  ollama: { wire: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', keyEnv: null },
  'openai-compat': { wire: 'openai', baseUrl: '', keyEnv: 'A11Y_LLM_API_KEY' },
}

export interface LlmBackend {
  wire: 'anthropic' | 'openai'
  model: string
  baseUrl: string
  apiKey?: string
  keyEnv: string | null
}

/**
 * Resolves "provider/model" (litellm-style) to a callable backend. Bare model
 * names default to Anthropic for back-compat. Overrides for self-hosted or
 * unlisted providers: A11Y_LLM_BASE_URL (endpoint) and A11Y_LLM_API_KEY (key).
 */
export const resolveBackend = (spec: string, env: Record<string, string | undefined> = process.env): LlmBackend => {
  const slash = spec.indexOf('/')
  const providerName = slash === -1 ? 'anthropic' : spec.slice(0, slash)
  const model = slash === -1 ? spec : spec.slice(slash + 1)
  const preset = PROVIDERS[providerName]
  if (!preset) {
    throw new Error(
      `Unknown LLM provider "${providerName}". Supported: ${Object.keys(PROVIDERS).join(', ')} — or use openai-compat/<model> with A11Y_LLM_BASE_URL for any Chat Completions endpoint.`,
    )
  }
  const baseUrl = env.A11Y_LLM_BASE_URL ?? preset.baseUrl
  if (!baseUrl) throw new Error(`Provider "${providerName}" needs A11Y_LLM_BASE_URL set to your endpoint.`)
  const apiKey = env.A11Y_LLM_API_KEY ?? (preset.keyEnv ? env[preset.keyEnv] : undefined)
  return { wire: preset.wire, model, baseUrl: baseUrl.replace(/\/$/, ''), apiKey, keyEnv: preset.keyEnv }
}

const callLlm = async (prompt: string, backend: LlmBackend): Promise<string> => {
  if (backend.wire === 'anthropic') {
    if (!backend.apiKey) throw new Error(`Anthropic backend needs ${backend.keyEnv} (optimizer/.env is loaded automatically).`)
    const response = await fetch(`${backend.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': backend.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: backend.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const data = (await response.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((c) => c.type === 'text')?.text
    if (!text) throw new Error('Anthropic API returned no text content')
    return text
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (backend.apiKey) headers.authorization = `Bearer ${backend.apiKey}`
  else if (backend.keyEnv) throw new Error(`This backend needs ${backend.keyEnv} (or A11Y_LLM_API_KEY); optimizer/.env is loaded automatically.`)
  const response = await fetch(`${backend.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: backend.model, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!response.ok) throw new Error(`LLM API ${response.status} at ${backend.baseUrl}: ${(await response.text()).slice(0, 300)}`)
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('LLM API returned no message content')
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
  const backend = resolveBackend(model)
  if (apiKey) backend.apiKey = apiKey

  const signalTotals = new Map<string, number>()
  for (const page of report.pages) {
    for (const [k, v] of Object.entries(page.signals ?? {})) signalTotals.set(k, (signalTotals.get(k) ?? 0) + v)
  }

  const llmItems = parseAdjudication(await callLlm(buildAdjudicationPrompt(report), backend), JUDGMENT_SCS)
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
