import type { Page } from 'playwright'
import type { Finding } from '../types.ts'

const DEFAULT_FOCUS_SAMPLE = 25

interface ElementProbe {
  selector: string
  keyboardOperable: boolean
  focusIndistinct: boolean
}

/**
 * Custom runtime checks for gaps axe-core does not cover:
 *  - 2.1.1 Keyboard: click-affordance elements that keyboard users cannot operate
 *  - 2.4.7 Focus Visible: focusable elements whose focused style is identical to blurred
 *  - 1.4.10 Reflow: horizontal overflow at a 320px viewport
 */
export const runKeyboardChecks = async (page: Page, url: string, focusSampleSize = DEFAULT_FOCUS_SAMPLE): Promise<Finding[]> => {
  const findings: Finding[] = []

  const probes = await page.evaluate((sampleSize) => {
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
    ).filter(isVisible)

    const focusSignature = (el: HTMLElement): string => {
      const s = getComputedStyle(el)
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join('|')
    }

    const results: { selector: string; keyboardOperable: boolean; focusIndistinct: boolean }[] = []
    let focusTested = 0
    for (const el of candidates) {
      const nativelyFocusable = el.matches(NATIVE_FOCUSABLE) && !el.hasAttribute('disabled')
      const tabindex = el.getAttribute('tabindex')
      const keyboardFocusable = nativelyFocusable || (tabindex !== null && Number(tabindex) >= 0)

      let focusIndistinct = false
      if (keyboardFocusable && focusTested < sampleSize) {
        focusTested += 1
        const blurred = focusSignature(el)
        el.focus({ preventScroll: true })
        const focused = focusSignature(el)
        el.blur()
        focusIndistinct = blurred === focused
      }

      results.push({ selector: cssPath(el), keyboardOperable: keyboardFocusable, focusIndistinct })
    }
    return results
  }, focusSampleSize)

  for (const probe of probes as ElementProbe[]) {
    if (!probe.keyboardOperable) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'keyboard-unreachable',
        impact: 'serious',
        wcag: ['2.1.1'],
        description: 'Element has a click affordance but cannot be focused or operated with a keyboard.',
        page: url,
        targets: [probe.selector],
      })
    } else if (probe.focusIndistinct) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'focus-not-visible',
        impact: 'serious',
        wcag: ['2.4.7'],
        description: 'Focused state is visually identical to the unfocused state — no visible focus indicator.',
        page: url,
        targets: [probe.selector],
      })
    }
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
