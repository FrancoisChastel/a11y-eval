import { PNG } from 'pngjs'
import type { Page } from 'playwright'
import { judgeContrast, parseCssColor, requiredRatio, worstCaseContrast } from '../contrastMath.ts'
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
  for (const item of items) {
    try {
      const locator = page.locator(item.target).first()
      const style = await locator.evaluate((el) => {
        const s = getComputedStyle(el)
        return { color: s.color, fontSize: parseFloat(s.fontSize), fontWeight: Number(s.fontWeight) || 400 }
      })
      const fg = parseCssColor(style.color)
      if (!fg) continue

      // Hide the text (and its shadow) so the screenshot is pure background.
      await locator.evaluate((el) => {
        const h = el as HTMLElement
        h.dataset.a11yPrevStyle = h.getAttribute('style') ?? ''
        h.style.setProperty('color', 'transparent', 'important')
        h.style.setProperty('text-shadow', 'none', 'important')
      })
      const shot = await locator.screenshot({ timeout: 3000 })
      await locator.evaluate((el) => {
        const h = el as HTMLElement
        const prev = h.dataset.a11yPrevStyle ?? ''
        if (prev) h.setAttribute('style', prev)
        else h.removeAttribute('style')
        delete h.dataset.a11yPrevStyle
      })

      const decoded = PNG.sync.read(shot)
      const worst = worstCaseContrast(fg, decoded.data)
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
