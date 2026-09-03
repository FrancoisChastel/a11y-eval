import { PNG } from 'pngjs'
import type { Page } from 'playwright'
import { judgeContrast, parseCssColor, pixelsUnderRenderedText, requiredRatio, worstCaseContrast } from '../contrastMath.ts'
import type { EvidencePacket, Finding } from '../types.ts'
import type { AxeIncompleteItem } from './axe.ts'

const MAX_ITEMS = 12

export interface CcaResult {
  findings: Finding[]
  evidence: EvidencePacket[]
  /** Targets measured (pass or fail) — VLM contrast triage skips these. */
  measuredTargets: string[]
}

/**
 * CCA engine: Colour-Contrast-Analyser-grade measurement for the nodes axe marks
 * undecidable (text over gradients/images). The foreground color is exact (computed
 * style); the background is sampled from a screenshot taken with the element's text
 * made transparent, so every pixel is pure background. The verdict uses the WORST
 * pixel — "contrast at its worst point" — deterministically, no LLM involved.
 */
export const runCcaContrast = async (page: Page, url: string, incompleteItems: AxeIncompleteItem[]): Promise<CcaResult> => {
  const result: CcaResult = { findings: [], evidence: [], measuredTargets: [] }
  const items = incompleteItems.filter((i) => i.ruleId === 'color-contrast').slice(0, MAX_ITEMS)
  if (items.length === 0) return result

  const resolved: string[] = []
  for (const [itemIndex, item] of items.entries()) {
    try {
      const locator = page.locator(item.target).first()
      const style = await locator.evaluate((el) => {
        const s = getComputedStyle(el)
        return { color: s.color, fontSize: parseFloat(s.fontSize), fontWeight: Number(s.fontWeight) || 400 }
      })
      const fg = parseCssColor(style.color)
      if (!fg) continue

      const renderedShot = await locator.screenshot({ timeout: 3000, animations: 'disabled' })

      // Mask all rendered glyphs, including child and pseudo-element text, so
      // foreground pixels cannot be mistaken for the sampled background.
      const maskId = `cca-${itemIndex}`
      await locator.evaluate((el, id) => el.setAttribute('data-a11y-cca-mask', id), maskId)
      const scope = `[data-a11y-cca-mask="${maskId}"]`
      const maskStyle = await page.addStyleTag({
        content: `${scope}, ${scope} *, ${scope}::before, ${scope}::after, ${scope} *::before, ${scope} *::after {
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
          text-shadow: none !important;
          caret-color: transparent !important;
        }`,
      })
      let shot: Buffer
      try {
        shot = await locator.screenshot({ timeout: 3000, animations: 'disabled' })
      } finally {
        await locator.evaluate((el) => el.removeAttribute('data-a11y-cca-mask')).catch(() => {})
        await maskStyle.evaluate((el) => el.parentNode?.removeChild(el)).catch(() => {})
      }

      const rendered = PNG.sync.read(renderedShot)
      const background = PNG.sync.read(shot)
      if (rendered.width !== background.width || rendered.height !== background.height) continue
      const textBackground = pixelsUnderRenderedText(background.data, rendered.data)
      const worst = worstCaseContrast(fg, textBackground)
      if (Number.isNaN(worst.minRatio)) continue

      const required = requiredRatio(style.fontSize, style.fontWeight)
      const verdict = judgeContrast(worst.minRatio, required)
      const measured = `measured worst-point ${worst.minRatio.toFixed(2)}:1 vs required ${required}:1 (${style.fontSize}px/${style.fontWeight}, ${worst.samples} px sampled)`
      result.measuredTargets.push(item.target)

      if (verdict === 'fail') {
        result.findings.push({
          engine: 'cca',
          ruleId: 'cca-contrast',
          impact: 'serious',
          wcag: ['1.4.3'],
          description: `Text fails contrast at its worst point over its image/gradient background: ${measured}. axe marked this undecidable; pixel measurement resolves it.`,
          page: url,
          targets: [item.target],
          html: item.html,
        })
      } else if (verdict === 'borderline') {
        result.findings.push({
          engine: 'cca',
          ruleId: 'cca-contrast-borderline',
          impact: 'moderate',
          wcag: ['1.4.3'],
          confidence: 'suspect',
          description: `Contrast is borderline at its worst point: ${measured}. Confirm with the design source of truth.`,
          page: url,
          targets: [item.target],
          html: item.html,
        })
      } else {
        resolved.push(`${item.target}: ${measured} — PASSES`)
      }
    } catch {
      /* not measurable (detached, zero-size, screenshot failure) — left for VLM triage */
    }
  }

  if (resolved.length > 0) {
    result.evidence.push({
      sc: '1.4.3',
      kind: 'cca',
      items: resolved.map((text) => ({ page: url, text: `CCA resolved axe-incomplete: ${text}` })),
    })
  }
  return result
}
