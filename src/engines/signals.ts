import type { Page } from 'playwright'
import type { ContentSignals } from '../types.ts'

/**
 * Detects content types on a page to gate manual-review applicability:
 * a criterion whose signal is 0 across all pages can be auto-suggested as
 * not-applicable (with evidence); a criterion with signals present must not
 * be dismissed without a warning.
 */
export const collectSignals = async (page: Page): Promise<ContentSignals> =>
  page.evaluate(() => {
    const count = (selector: string): number => document.querySelectorAll(selector).length

    const pageLang = document.documentElement.getAttribute('lang')?.toLowerCase().split('-')[0] ?? ''
    const langParts = Array.from(document.querySelectorAll('[lang]')).filter((el) => {
      if (el === document.documentElement) return false
      const lang = el.getAttribute('lang')?.toLowerCase().split('-')[0] ?? ''
      return lang !== '' && lang !== pageLang
    }).length

    const hoverContent =
      count('[title]:not(iframe):not(html)') +
      count('[aria-haspopup]') +
      count('[data-tooltip], [data-tippy-content], [popovertarget]')

    return {
      media: count('video, audio') + count('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"]'),
      forms: count('input:not([type="hidden"]), select, textarea, [contenteditable="true"]'),
      drag: count('[draggable="true"], input[type="range"]'),
      hoverContent,
      langParts,
      iframes: count('iframe'),
    }
  })

export const emptySignals = (): ContentSignals => ({
  media: 0,
  forms: 0,
  drag: 0,
  hoverContent: 0,
  langParts: 0,
  iframes: 0,
})

/** Sum signals across pages — the app-level applicability picture. */
export const totalSignals = (all: (ContentSignals | undefined)[]): ContentSignals => {
  const total = emptySignals()
  for (const s of all) {
    if (!s) continue
    for (const key of Object.keys(total) as (keyof ContentSignals)[]) total[key] += s[key]
  }
  return total
}
