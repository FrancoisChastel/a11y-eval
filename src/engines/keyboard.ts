import type { Page } from 'playwright'
import type { Finding } from '../types.ts'

const DEFAULT_FOCUS_SAMPLE = 25

interface ElementProbe {
  selector: string
  keyboardUnreachable: boolean
}

interface FocusCandidate {
  id: string
  selector: string
  blurred: string
}

/**
 * Custom runtime checks for gaps axe-core does not cover:
 *  - 2.1.1 Keyboard: click-affordance elements that keyboard users cannot operate
 *  - 2.4.7 Focus Visible: focusable elements whose focused style is identical to blurred
 *  - 1.4.10 Reflow: horizontal overflow at a 320px viewport
 */
export const runKeyboardChecks = async (page: Page, url: string, focusSampleSize = DEFAULT_FOCUS_SAMPLE): Promise<Finding[]> => {
  const findings: Finding[] = []

  const pageProbes = await page.evaluate(() => {
    const cssPath = (el: Element): string => {
      const parts: string[] = []
      let node: Element | null = el
      while (node && node !== document.documentElement && parts.length < 4) {
        let part = node.tagName.toLowerCase()
        if (node.id) {
          parts.unshift(`${part}#${node.id}`)
          break
        }
        const cls = Array.from(node.classList).slice(0, 2).join('.')
        if (cls) part += `.${cls}`
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

    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }

    const NATIVE_FOCUSABLE = 'a[href], button, input, select, textarea, summary, [contenteditable="true"]'
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`${NATIVE_FOCUSABLE}, [onclick], [role="button"], [role="link"], [tabindex]`),
    ).filter(
      (el) =>
        isVisible(el) &&
        !el.matches(':disabled') &&
        el.getAttribute('aria-disabled') !== 'true' &&
        !el.closest('[aria-hidden="true"]'),
    )

    const focusSignature = (el: HTMLElement): string => {
      const s = getComputedStyle(el)
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join('|')
    }

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()

    const elements: ElementProbe[] = []
    const focusCandidates: FocusCandidate[] = []
    for (const [index, el] of candidates.entries()) {
      const tabindex = el.getAttribute('tabindex')
      const removedFromTabOrder = tabindex !== null && Number(tabindex) < 0
      const nativelyFocusable = el.matches(NATIVE_FOCUSABLE) && !removedFromTabOrder
      const keyboardFocusable = nativelyFocusable || (tabindex !== null && Number(tabindex) >= 0)
      const hasClickAffordance = el.matches(`${NATIVE_FOCUSABLE}, [onclick], [role="button"], [role="link"]`)
      const managedCompositeItem =
        removedFromTabOrder &&
        el.matches(
          '[role="tab"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"], [role="gridcell"], [role="row"]',
        )

      if (keyboardFocusable) {
        const id = String(index)
        el.setAttribute('data-a11y-focus-probe', id)
        focusCandidates.push({ id, selector: cssPath(el), blurred: focusSignature(el) })
      }

      elements.push({
        selector: cssPath(el),
        keyboardUnreachable: hasClickAffordance && !keyboardFocusable && !managedCompositeItem,
      })
    }
    return { elements, focusCandidates }
  })

  for (const probe of pageProbes.elements) {
    if (probe.keyboardUnreachable) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'keyboard-unreachable',
        impact: 'serious',
        wcag: ['2.1.1'],
        description: 'Element has a click affordance but cannot be focused or operated with a keyboard.',
        page: url,
        targets: [probe.selector],
      })
    }
  }

  const candidateById = new Map(pageProbes.focusCandidates.map((candidate) => [candidate.id, candidate]))
  const tested = new Set<string>()
  const maxTabPresses = Math.min(Math.max(pageProbes.focusCandidates.length * 2, focusSampleSize * 2), 200)
  try {
    for (let press = 0; press < maxTabPresses && tested.size < focusSampleSize; press += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        if (!(el instanceof HTMLElement)) return null
        const id = el.getAttribute('data-a11y-focus-probe')
        if (id === null) return null
        const s = getComputedStyle(el)
        const signature = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join('|')
        return { id, signature }
      })
      if (!focused) continue
      if (tested.has(focused.id)) break
      tested.add(focused.id)
      const candidate = candidateById.get(focused.id)
      if (!candidate || candidate.blurred !== focused.signature) continue

      findings.push({
        engine: 'keyboard',
        ruleId: 'focus-not-visible',
        impact: 'serious',
        wcag: ['2.4.7'],
        description: 'Focused state is visually identical to the unfocused state — no visible focus indicator.',
        page: url,
        targets: [candidate.selector],
      })
    }
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('[data-a11y-focus-probe]').forEach((el) => el.removeAttribute('data-a11y-focus-probe'))
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
  }

  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 320, height: 900 })
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return el.scrollWidth - el.clientWidth
  })
  if (overflow > 2) {
    findings.push({
      engine: 'keyboard',
      ruleId: 'horizontal-overflow-320',
      impact: 'moderate',
      wcag: ['1.4.10'],
      description: `Page overflows horizontally by ${overflow}px at a 320px viewport; content requiring two-dimensional scrolling fails Reflow unless exempt (tables, maps, diagrams).`,
      page: url,
      targets: ['html'],
    })
  }
  if (originalViewport) await page.setViewportSize(originalViewport)

  return findings
}
