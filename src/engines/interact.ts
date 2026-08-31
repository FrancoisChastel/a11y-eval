import type { Page } from 'playwright'
import type { Finding } from '../types.ts'

const MAX_INPUT_PROBES = 10
const MAX_DIALOG_PROBES = 5
const SETTLE_MS = 600

/**
 * Opt-in state-changing probes (--interact). These CHANGE form state and open
 * dialogs — run them against staging/fixtures only, never production.
 *
 *  - 3.2.2 On Input: changing a select/radio/checkbox must not navigate or submit.
 *  - 2.1.2 Keyboard Trap: openable dialogs must close with Escape.
 */
export const runInteractProbes = async (page: Page, url: string): Promise<Finding[]> => {
  const findings: Finding[] = []
  const startUrl = page.url()

  // --- 3.2.2: change each discrete input, watch for navigation ---
  const inputSelectors = await page.evaluate((max) => {
    const cssPath = (el: Element): string => {
      let part = el.tagName.toLowerCase()
      if (el.id) return `${part}#${el.id}`
      const name = el.getAttribute('name')
      if (name) return `${part}[name="${name}"]`
      return part
    }
    return Array.from(document.querySelectorAll<HTMLElement>('select, input[type="radio"], input[type="checkbox"]'))
      .filter((el) => !el.hasAttribute('disabled'))
      .slice(0, max)
      .map(cssPath)
  }, MAX_INPUT_PROBES)

  for (const selector of inputSelectors) {
    try {
      const locator = page.locator(selector).first()
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase())
      if (tag === 'select') {
        const values = await locator.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => o.value))
        const current = await locator.inputValue()
        const next = values.find((v) => v !== current)
        if (next !== undefined) await locator.selectOption(next)
      } else {
        await locator.setChecked(true)
      }
      await page.waitForTimeout(SETTLE_MS)
      if (page.url() !== startUrl) {
        findings.push({
          engine: 'keyboard',
          ruleId: 'on-input-context-change',
          impact: 'serious',
          wcag: ['3.2.2'],
          description: `Changing this input navigated to ${page.url()} without prior warning — value changes must not change context.`,
          page: url,
          targets: [selector],
        })
        await page.goto(startUrl, { waitUntil: 'networkidle' })
      }
    } catch {
      /* input not interactable in this state */
    }
  }

  // --- 2.1.2: dialogs must be Escape-dismissible ---
  const dialogTriggers = await page.evaluate((max) =>
    Array.from(document.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"], [popovertarget]'))
      .slice(0, max)
      .map((el) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[aria-haspopup="dialog"]`)),
    MAX_DIALOG_PROBES,
  )

  const openDialogCount = () =>
    page.evaluate(
      () =>
        document.querySelectorAll('dialog[open], [role="dialog"]:not([hidden]), :popover-open, [aria-modal="true"]:not([hidden])')
          .length,
    )

  for (const selector of dialogTriggers) {
    try {
      const before = await openDialogCount()
      await page.locator(selector).first().click({ timeout: 2_000 })
      await page.waitForTimeout(SETTLE_MS)
      if ((await openDialogCount()) <= before) continue
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      if ((await openDialogCount()) > before) {
        findings.push({
          engine: 'keyboard',
          ruleId: 'dialog-escape-trap',
          impact: 'serious',
          wcag: ['2.1.2'],
          confidence: 'suspect',
          description: 'Dialog opened by this trigger does not close on Escape — verify keyboard users have a reachable way out.',
          page: url,
          targets: [selector],
        })
        // Best effort to restore state for subsequent probes.
        await page.goto(startUrl, { waitUntil: 'networkidle' }).catch(() => {})
      }
    } catch {
      /* trigger not clickable */
    }
  }

  return findings
}
