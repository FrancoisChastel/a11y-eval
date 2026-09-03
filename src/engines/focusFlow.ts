import type { Page } from 'playwright'
import { findOrderJumps, type FocusStop } from '../checks.ts'
import type { EvidencePacket, Finding } from '../types.ts'

const MAX_FOCUS_PROBES = 40
const MAX_TAB_STEPS = 60

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'

export interface FocusFlowResult {
  findings: Finding[]
  tabOrder: EvidencePacket
  /** Raw tab stops with document coordinates — used by the VLM overlay check. */
  stops: FocusStop[]
}

/**
 * Three checks from one keyboard session:
 *  - 3.2.1 On Focus (checked): focusing an element must not open a dialog, steal
 *    focus, or navigate. Dialog/navigation are violations; focus theft a suspect.
 *  - 2.1.2 No Keyboard Trap (suspects): Tab must keep moving focus; a stop that
 *    swallows Tab is flagged.
 *  - 2.4.3 Focus Order (suspects): tab stops landing fully above their
 *    predecessor signal reading-order breaks.
 */
export const runFocusFlowChecks = async (page: Page, url: string): Promise<FocusFlowResult> => {
  const findings: Finding[] = []
  const startUrl = page.url()

  // --- 3.2.1: probe each focusable individually so a violator is identifiable ---
  const count = Math.min(await page.locator(FOCUSABLE).count(), MAX_FOCUS_PROBES)
  for (let i = 0; i < count; i += 1) {
    let probe: { selector: string; dialogAppeared: boolean; focusStolen: boolean } | null = null
    try {
      probe = await page.evaluate(
        ({ selector, index }) => {
          const cssPath = (el: Element): string => {
            const parts: string[] = []
            let node: Element | null = el
            while (node && node !== document.documentElement && parts.length < 4) {
              let part = node.tagName.toLowerCase()
              if (node.id) {
                parts.unshift(`${part}#${node.id}`)
                break
              }
              const parent: Element | null = node.parentElement
              if (parent) {
                const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
                if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
              }
              parts.unshift(part)
              node = parent
            }
            return parts.join(' > ')
          }
          const dialogCount = () =>
            document.querySelectorAll('dialog[open], [role="dialog"]:not([hidden]), [aria-modal="true"]:not([hidden])').length
          const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
          const el = els[index]
          if (!el) return null
          const style = getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          if (
            el.matches(':disabled') ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.closest('[aria-hidden="true"]') ||
            rect.width === 0 ||
            rect.height === 0 ||
            style.visibility === 'hidden' ||
            style.display === 'none'
          ) {
            return null
          }
          const before = dialogCount()
          el.focus({ preventScroll: true })
          const after = dialogCount()
          const active = document.activeElement
          const result = {
            selector: cssPath(el),
            dialogAppeared: after > before,
            focusStolen: active !== el && active !== document.body && active !== null,
          }
          el.blur()
          return result
        },
        { selector: FOCUSABLE, index: i },
      )
    } catch {
      findings.push({
        engine: 'keyboard',
        ruleId: 'on-focus-navigation',
        impact: 'serious',
        wcag: ['3.2.1'],
        description: `Focusing an element (probe #${i + 1}) navigated away from the page — receiving focus must never change context.`,
        page: url,
        targets: [`focusable #${i + 1} of ${count}`],
      })
      await page.goto(startUrl, { waitUntil: 'networkidle' }).catch(() => {})
      continue
    }
    if (!probe) continue
    if (probe.dialogAppeared) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'on-focus-context-change',
        impact: 'serious',
        wcag: ['3.2.1'],
        description: 'A dialog/modal appeared when this element merely received focus — context changes on focus are forbidden.',
        page: url,
        targets: [probe.selector],
      })
    } else if (probe.focusStolen) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'on-focus-focus-theft',
        impact: 'moderate',
        wcag: ['3.2.1'],
        confidence: 'suspect',
        description: 'Focusing this element moved focus somewhere else — verify no unexpected context change.',
        page: url,
        targets: [probe.selector],
      })
    }
  }

  // --- Tab walk: 2.1.2 traps + 2.4.3 order + evidence trail ---
  // Fresh load: closes anything the focus probes opened AND resets the browser's
  // sequential-focus starting point (otherwise Tab continues from the last
  // probed element instead of the top of the page).
  await page.goto(startUrl, { waitUntil: 'networkidle' }).catch(() => {})
  const stops: FocusStop[] = []
  let stuckAt: string | null = null
  let repeats = 0
  for (let step = 0; step < MAX_TAB_STEPS; step += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate((): (FocusStop & { multiSegment: boolean }) | null => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const rect = el.getBoundingClientRect()
      let part = el.tagName.toLowerCase()
      if (el.id) part += `#${el.id}`
      else if (el.classList.length > 0) part += `.${Array.from(el.classList).slice(0, 2).join('.')}`
      // Date/time inputs (and audio/video controls) have UA-internal focus segments:
      // Tab moves within them while activeElement stays constant — not a trap.
      const type = el.getAttribute('type') ?? ''
      const multiSegment =
        ['date', 'time', 'datetime-local', 'month', 'week'].includes(type) || ['AUDIO', 'VIDEO'].includes(el.tagName)
      return { selector: part, x: Math.round(rect.x), y: Math.round(rect.y + scrollY), height: Math.round(rect.height), multiSegment }
    })
    if (!stop) break
    if (stops.length > 1 && stops[0].selector === stop.selector && stops[0].y === stop.y && stops[0].x === stop.x) break
    const prev = stops[stops.length - 1]
    if (prev && prev.selector === stop.selector && prev.y === stop.y && prev.x === stop.x) {
      repeats += 1
      if (repeats >= 4 && stuckAt === null && !stop.multiSegment) stuckAt = stop.selector
    } else {
      repeats = 0
      stops.push(stop)
    }
  }

  if (stuckAt) {
    findings.push({
      engine: 'keyboard',
      ruleId: 'keyboard-trap-suspect',
      impact: 'serious',
      wcag: ['2.1.2'],
      confidence: 'suspect',
      description: `Tab stopped advancing at this element (focus repeated 3+ times) — verify it is not a keyboard trap.`,
      page: url,
      targets: [stuckAt],
    })
  }

  for (const jump of findOrderJumps(stops)) {
    findings.push({
      engine: 'keyboard',
      ruleId: 'focus-order-suspect',
      impact: 'moderate',
      wcag: ['2.4.3'],
      confidence: 'suspect',
      description: `Tab order jumps upward by ~${jump.upwardBy}px: ${jump.from} → ${jump.to}. Verify the sequence still preserves meaning and operability.`,
      page: url,
      targets: [jump.to],
    })
  }

  const tabOrder: EvidencePacket = {
    sc: '2.4.3',
    kind: 'tab-order',
    items: stops.map((s, i) => ({ page: url, selector: s.selector, text: `#${i + 1} at y=${s.y}` })),
  }

  return { findings, tabOrder, stops }
}
