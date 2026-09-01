import type { CDPSession, Page } from 'playwright'
import type { EvidencePacket } from '../types.ts'

export type SrDriver = 'axtree' | 'nvda' | 'voiceover'

export interface SrResult {
  driverUsed: SrDriver
  phrases: string[]
  evidence: EvidencePacket
  note?: string
}

interface AxValue {
  value?: unknown
}

interface AxNode {
  nodeId: string
  ignored: boolean
  role?: AxValue
  name?: AxValue
  properties?: { name: string; value: AxValue }[]
  childIds?: string[]
}

const SILENT_ROLES = new Set(['none', 'presentation', 'generic', 'InlineTextBox', 'LineBreak'])
const CONTAINER_ROLES = new Set(['RootWebArea', 'paragraph', 'main', 'banner', 'contentinfo', 'navigation', 'complementary', 'region', 'list', 'form', 'section', 'group', 'Section', 'sectionheader'])
const MAX_PHRASES = 200

/**
 * Composes screen-reader-style phrases from accessibility-tree nodes, roughly the
 * way NVDA/VoiceOver announce them: role, name, and the states that change what a
 * user would do (level, checked, expanded, disabled, required, current value).
 * Pure — unit-tested apart from the CDP plumbing.
 */
export const composeNarration = (nodes: AxNode[]): string[] => {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const phrases: string[] = []

  const prop = (node: AxNode, name: string): unknown => node.properties?.find((p) => p.name === name)?.value.value

  const visit = (node: AxNode | undefined): void => {
    if (!node || phrases.length >= MAX_PHRASES) return
    const role = String(node.role?.value ?? '')
    const name = String(node.name?.value ?? '').trim()

    if (!node.ignored && !SILENT_ROLES.has(role)) {
      if (role === 'StaticText' || role === 'text') {
        if (name) phrases.push(name)
      } else if (!CONTAINER_ROLES.has(role) || name) {
        const parts: string[] = []
        if (role === 'heading') parts.push(`heading level ${prop(node, 'level') ?? '?'}`)
        else parts.push(role)
        if (name) parts.push(name)
        const checked = prop(node, 'checked')
        if (checked !== undefined) parts.push(checked === 'true' || checked === true ? 'checked' : 'not checked')
        const expanded = prop(node, 'expanded')
        if (expanded !== undefined) parts.push(expanded === true || expanded === 'true' ? 'expanded' : 'collapsed')
        if (prop(node, 'disabled') === true) parts.push('disabled')
        if (prop(node, 'required') === true) parts.push('required')
        const value = prop(node, 'valuetext') ?? prop(node, 'valueNow')
        if (value !== undefined) parts.push(String(value))
        if ((role === 'button' || role === 'link' || role === 'textbox' || role === 'combobox') && !name) parts.push('(no accessible name)')
        phrases.push(parts.join(', '))
      }
    }
    for (const childId of node.childIds ?? []) visit(byId.get(childId))
  }

  visit(nodes[0])
  return phrases
}

const axtreeNarration = async (page: Page): Promise<string[]> => {
  const session: CDPSession = await page.context().newCDPSession(page)
  try {
    await session.send('Accessibility.enable')
    const { nodes } = (await session.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] }
    return composeNarration(nodes)
  } finally {
    await session.detach().catch(() => {})
  }
}

/**
 * Drives a REAL screen reader (NVDA on Windows, VoiceOver on macOS) via the
 * open-source Guidepup driver: navigates the page item by item and records the
 * actually-spoken phrases. Requires a headed browser, a focused window, and a
 * one-time `npx @guidepup/setup` — hence experimental. Throws on unsupported
 * OS/config; the caller falls back to the axtree simulation.
 */
const realNarration = async (page: Page, driver: 'nvda' | 'voiceover'): Promise<string[]> => {
  const guidepup = (await import('@guidepup/guidepup')) as {
    nvda?: { start: () => Promise<void>; stop: () => Promise<void>; next: () => Promise<void>; lastSpokenPhrase: () => Promise<string> }
    voiceOver?: { start: () => Promise<void>; stop: () => Promise<void>; next: () => Promise<void>; lastSpokenPhrase: () => Promise<string> }
  }
  const sr = driver === 'nvda' ? guidepup.nvda : guidepup.voiceOver
  if (!sr) throw new Error(`${driver} driver unavailable on this platform`)
  await page.bringToFront()
  await sr.start()
  const phrases: string[] = []
  try {
    for (let i = 0; i < 80; i += 1) {
      await sr.next()
      const phrase = (await sr.lastSpokenPhrase()).trim()
      if (!phrase) continue
      if (phrases.length > 2 && phrase === phrases[phrases.length - 1]) break // end of document
      phrases.push(phrase)
    }
  } finally {
    await sr.stop().catch(() => {})
  }
  return phrases
}

/**
 * Screen-reader pass: what would a screen reader user hear on this page, start to
 * finish? Default driver 'axtree' composes the narration from Chromium's real
 * accessibility tree (deterministic, cross-platform — a simulation, not NVDA
 * itself). 'nvda'/'voiceover' capture the real thing via Guidepup where available,
 * falling back to axtree with an explicit note when they cannot run.
 */
export const runScreenReader = async (page: Page, url: string, driver: SrDriver): Promise<SrResult> => {
  let phrases: string[]
  let driverUsed: SrDriver = driver
  let note: string | undefined

  if (driver === 'axtree') {
    phrases = await axtreeNarration(page)
  } else {
    try {
      phrases = await realNarration(page, driver)
    } catch (error) {
      note = `${driver} could not run (${error instanceof Error ? error.message.slice(0, 120) : String(error)}) — fell back to the axtree simulation. Real-driver runs need the right OS, a headed browser, and \`npx @guidepup/setup\`.`
      phrases = await axtreeNarration(page)
      driverUsed = 'axtree'
    }
  }

  const unnamed = phrases.filter((p) => p.includes('(no accessible name)')).length
  const summary =
    `Narration (${driverUsed}${driverUsed === 'axtree' ? ' simulation from the Chromium accessibility tree' : ' — real screen reader'}): ` +
    `${phrases.length} phrase(s)${unnamed > 0 ? `, ${unnamed} interactive element(s) announced without a name` : ''}.`

  return {
    driverUsed,
    phrases,
    note,
    evidence: {
      sc: '2.4.3',
      kind: 'screen-reader',
      items: [
        { page: url, text: summary },
        ...phrases.slice(0, 40).map((p, i) => ({ page: url, text: `${i + 1}. ${p}` })),
      ],
    },
  }
}
