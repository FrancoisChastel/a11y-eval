import { describe, expect, test } from 'vitest'
import { buildAdjudicationPrompt, parseAdjudication, resolveBackend } from '../src/engines/adjudicate.ts'
import { extractJson } from '../src/engines/vlm.ts'
import { COVERAGE_NOTE, MANUAL_CHECKLIST } from '../src/wcag.ts'
import type { Report } from '../src/types.ts'

const report = (): Report => ({
  tool: 'a11y-eval',
  version: 't',
  target: 'wcag22aa',
  startedAt: 's',
  finishedAt: 'f',
  pages: [{ url: 'http://x/', findings: [], passes: 1, incomplete: 0 }],
  findings: [
    { engine: 'keyboard', ruleId: 'focus-order-suspect', impact: 'moderate', wcag: ['2.4.3'], confidence: 'suspect', description: 'Tab jumps upward: #footer → #b', page: 'http://x/', targets: ['#b'] },
  ],
  totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  score: 100,
  verdict: 'pass',
  manualChecklist: MANUAL_CHECKLIST,
  coverageNote: COVERAGE_NOTE,
  evidence: [
    { sc: '2.4.6', kind: 'headings', items: [{ page: 'http://x/', selector: 'h1', text: 'Payments' }] },
    { sc: '3.3.2', kind: 'labels', items: [{ page: 'http://x/', selector: 'label', text: '"Date" → text name=d' }] },
  ],
})

describe('buildAdjudicationPrompt', () => {
  test('includes suspects, evidence, judging rules, and the JSON contract', () => {
    const prompt = buildAdjudicationPrompt(report())
    expect(prompt).toContain('Tab jumps upward: #footer → #b')
    expect(prompt).toContain('Payments')
    expect(prompt).toContain('"Date" → text name=d')
    expect(prompt).toContain('WCAG 2.4.6')
    expect(prompt).toContain('"needs-expert"')
    expect(prompt).toContain('prefer needs-expert over a guessed pass')
  })
})

describe('resolveBackend', () => {
  test('bare model names default to Anthropic (back-compat)', () => {
    const b = resolveBackend('claude-haiku-4-5-20251001', { ANTHROPIC_API_KEY: 'k' })
    expect(b).toMatchObject({ wire: 'anthropic', model: 'claude-haiku-4-5-20251001', apiKey: 'k' })
    expect(b.baseUrl).toBe('https://api.anthropic.com')
  })

  test('provider prefixes select wire, endpoint, and key env var', () => {
    expect(resolveBackend('openai/gpt-5-mini', { OPENAI_API_KEY: 'ok' })).toMatchObject({
      wire: 'openai',
      model: 'gpt-5-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'ok',
    })
    expect(resolveBackend('gemini/gemini-2.5-flash', { GEMINI_API_KEY: 'gk' }).apiKey).toBe('gk')
    expect(resolveBackend('openrouter/meta-llama/llama-4', { OPENROUTER_API_KEY: 'r' }).model).toBe('meta-llama/llama-4')
  })

  test('ollama is keyless and local', () => {
    const b = resolveBackend('ollama/llama3.1', {})
    expect(b).toMatchObject({ wire: 'openai', apiKey: undefined, keyEnv: null })
    expect(b.baseUrl).toContain('11434')
  })

  test('A11Y_LLM_BASE_URL and A11Y_LLM_API_KEY override any provider', () => {
    const b = resolveBackend('openai-compat/local-model', { A11Y_LLM_BASE_URL: 'http://gpu-box:8000/v1/', A11Y_LLM_API_KEY: 'x' })
    expect(b.baseUrl).toBe('http://gpu-box:8000/v1')
    expect(b.apiKey).toBe('x')
  })

  test('unknown provider and missing base url raise actionable errors', () => {
    expect(() => resolveBackend('notaprovider/model', {})).toThrow(/Supported:/)
    expect(() => resolveBackend('openai-compat/model', {})).toThrow(/A11Y_LLM_BASE_URL/)
  })
})

describe('parseAdjudication', () => {
  test('parses statuses and demotes low-confidence verdicts to needs-expert', () => {
    const items = parseAdjudication(
      `Here is my assessment:\n[
        {"sc":"2.4.6","status":"pass","confidence":"high","evidence":"Headings describe sections."},
        {"sc":"3.3.2","status":"fail","confidence":"high","evidence":"Label 'Date' lacks format guidance."},
        {"sc":"2.4.3","status":"pass","confidence":"low","evidence":"Jump may be intentional."}
      ]`,
      ['2.4.6', '3.3.2', '2.4.3'],
    )
    expect(items.find((i) => i.sc === '2.4.6')?.status).toBe('pass')
    expect(items.find((i) => i.sc === '3.3.2')?.status).toBe('fail')
    expect(items.find((i) => i.sc === '2.4.3')?.status).toBe('needs-expert')
    expect(items.every((i) => i.method === 'llm')).toBe(true)
  })

  test('drops unknown criteria and invalid statuses become needs-expert', () => {
    const items = parseAdjudication(
      `[{"sc":"9.9.9","status":"pass"},{"sc":"2.4.6","status":"definitely-fine","evidence":"x"}]`,
      ['2.4.6'],
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ sc: '2.4.6', status: 'needs-expert' })
  })

  test('throws when no JSON array is present', () => {
    expect(() => parseAdjudication('I cannot do that.', ['2.4.6'])).toThrow()
  })
})

describe('extractJson (vlm parsing)', () => {
  test('extracts objects and arrays from prose-wrapped responses', () => {
    expect(extractJson('Sure! {"colorOnlyMeaning": true, "where": "badges"}')).toEqual({ colorOnlyMeaning: true, where: 'badges' })
    expect(extractJson('Result:\n[{"index":0,"adequate":false}]\nDone.')).toEqual([{ index: 0, adequate: false }])
    expect(extractJson('I cannot analyze this.')).toBeNull()
    expect(extractJson('{"broken": ')).toBeNull()
  })
})
