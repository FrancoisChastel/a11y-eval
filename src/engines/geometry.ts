import type { Page } from 'playwright'
import { analyzeTargetSizes, type TargetBox } from '../checks.ts'
import type { Finding } from '../types.ts'

/**
 * WCAG 2.5.8 Target Size (Minimum), mechanized: collects every interactive
 * target's effective clickable box (inputs union their associated label — the
 * label IS the target), applies the size, inline, and 24px-circle spacing
 * exceptions, and emits suspects for what remains. Suspects, not violations:
 * the "equivalent control elsewhere" exception cannot be ruled out mechanically.
 */
export const runTargetSizeCheck = async (page: Page, url: string): Promise<Finding[]> => {
  const boxes = await page.evaluate((): TargetBox[] => {
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

    const labelFor = (el: HTMLElement): HTMLElement | null => {
      const wrapping = el.closest('label')
      if (wrapping) return wrapping
      if (el.id) {
        const explicit = document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`)
        if (explicit) return explicit
      }
      return null
    }

    // Text-entry controls at their default size fall under 2.5.8's "user agent
    // determined" exception — only activation targets are in scope.
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], input[type="image"], [role="button"], [role="link"], [onclick]',
      ),
    ).filter(isVisible)

    return candidates.map((el) => {
      // The effective target of a labeled control is the union with its label.
      const label = el.matches('input, select, textarea') ? labelFor(el) : null
      let rect = el.getBoundingClientRect()
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const left = Math.min(rect.left, labelRect.left)
        const top = Math.min(rect.top, labelRect.top)
        rect = new DOMRect(left, top, Math.max(rect.right, labelRect.right) - left, Math.max(rect.bottom, labelRect.bottom) - top)
      }
      const display = getComputedStyle(el).display
      const parent = el.parentElement
      const hasTextSiblings = parent
        ? Array.from(parent.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0)
        : false
      return {
        selector: cssPath(el),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        inline: display.startsWith('inline') && hasTextSiblings,
      }
    })
  })

  return analyzeTargetSizes(boxes).map((suspect) => ({
    engine: 'keyboard' as const,
    ruleId: 'target-size-suspect',
    impact: 'moderate' as const,
    wcag: ['2.5.8'],
    confidence: 'suspect' as const,
    description: `Target is ${Math.round(suspect.width)}×${Math.round(suspect.height)} CSS px (<24×24) and a 24px circle centered on it touches: ${suspect.overlaps.slice(0, 3).join(', ')}. Fails size and spacing exceptions; confirm no equivalent larger control exists.`,
    page: url,
    targets: [suspect.selector],
  }))
}
