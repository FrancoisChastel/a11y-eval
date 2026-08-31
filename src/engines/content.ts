import { francAll } from 'franc-min'
import type { Page } from 'playwright'
import { LANG_DETECT_MIN_CHARS, findSensoryPhrases, normalizePageLang } from '../checks.ts'
import type { EvidencePacket, Finding } from '../types.ts'

export interface ContentCheckResult {
  findings: Finding[]
  evidence: EvidencePacket[]
}

interface PageContent {
  pageLang: string | null
  bodyText: string
  textBlocks: { selector: string; text: string }[]
  headings: { selector: string; text: string }[]
  labels: { selector: string; text: string; control: string }[]
  media: { selector: string; hasCaptionTrack: boolean }[]
  sliders: { selector: string; native: boolean }[]
}

/**
 * Text- and content-level checks plus the evidence packets the judgment
 * criteria need (headings/labels for 2.4.6 & 3.3.2, phrases for 1.3.3, media
 * for 1.2.2). One DOM extraction feeds everything.
 */
export const runContentChecks = async (page: Page, url: string): Promise<ContentCheckResult> => {
  const content = await page.evaluate((): PageContent => {
    const cssPath = (el: Element): string => {
      let part = el.tagName.toLowerCase()
      if (el.id) return `${part}#${el.id}`
      if (el.classList.length > 0) part += `.${Array.from(el.classList).slice(0, 2).join('.')}`
      return part
    }
    const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

    const controlName = (label: HTMLLabelElement): string => {
      const control = label.control ?? label.querySelector('input, select, textarea')
      if (!control) return 'unassociated'
      const type = control.getAttribute('type') ?? control.tagName.toLowerCase()
      return `${type}${control.getAttribute('name') ? ` name=${control.getAttribute('name')}` : ''}`
    }

    return {
      pageLang: document.documentElement.getAttribute('lang'),
      bodyText: (() => {
        const clone = document.body.cloneNode(true) as HTMLElement
        for (const el of clone.querySelectorAll('[data-a11y-eval-ignore], script, style')) el.remove()
        return (clone.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20000)
      })(),
      textBlocks: Array.from(document.querySelectorAll('p, li, blockquote, td, dd'))
        .filter((el) => !el.closest('[lang]:not(html)') && !el.closest('[data-a11y-eval-ignore]'))
        .map((el) => ({ selector: cssPath(el), text: text(el) }))
        .filter((b) => b.text.length >= 40)
        .slice(0, 60),
      headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((el) => ({
        selector: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
        text: text(el).slice(0, 120),
      })),
      labels: Array.from(document.querySelectorAll('label')).map((el) => ({
        selector: cssPath(el),
        text: text(el).slice(0, 120),
        control: controlName(el as HTMLLabelElement),
      })),
      media: Array.from(document.querySelectorAll('video')).map((el) => ({
        selector: cssPath(el),
        hasCaptionTrack: el.querySelector('track[kind="captions"], track[kind="subtitles"]') !== null,
      })),
      sliders: [
        ...Array.from(document.querySelectorAll('input[type="range"]')).map((el) => ({ selector: cssPath(el), native: true })),
        ...Array.from(document.querySelectorAll('[role="slider"]:not(input)')).map((el) => ({ selector: cssPath(el), native: false })),
      ],
    }
  })

  const findings: Finding[] = []

  // 1.3.3 sensory phrases → suspects
  for (const match of findSensoryPhrases(content.bodyText)) {
    findings.push({
      engine: 'keyboard',
      ruleId: 'sensory-instruction-suspect',
      impact: 'moderate',
      wcag: ['1.3.3'],
      confidence: 'suspect',
      description: `Instruction may rely on ${match.pattern}: "${match.phrase}". Verify the reference also works without that sense.`,
      page: url,
      targets: ['body'],
    })
  }

  // 3.1.2 foreign-language blocks without lang → suspects
  const pageLang3 = normalizePageLang(content.pageLang)
  if (pageLang3) {
    for (const block of content.textBlocks) {
      const letters = block.text.replace(/[^\p{L}\s]/gu, '')
      if (letters.length < 120) continue
      const ranked = francAll(letters, { minLength: 80 })
      const top = ranked[0]
      if (!top || top[0] === 'und' || top[0] === pageLang3) continue
      const pageScore = ranked.find(([code]) => code === pageLang3)?.[1] ?? 0
      // Only flag when the page language is a clearly worse fit than the detected one.
      if (pageScore >= 0.85 * top[1]) continue
      const detected = top[0]
      {
        findings.push({
          engine: 'keyboard',
          ruleId: 'lang-of-parts-suspect',
          impact: 'moderate',
          wcag: ['3.1.2'],
          confidence: 'suspect',
          description: `Text block reads as "${detected}" while the page is "${content.pageLang}", and has no lang attribute: "${block.text.slice(0, 80)}…"`,
          page: url,
          targets: [block.selector],
        })
      }
    }
  }

  // 1.2.2 caption-track presence → suspects
  for (const media of content.media.filter((m) => !m.hasCaptionTrack)) {
    findings.push({
      engine: 'keyboard',
      ruleId: 'no-caption-track',
      impact: 'serious',
      wcag: ['1.2.2'],
      confidence: 'suspect',
      description: 'Video has no captions/subtitles track element. Verify captions exist another way (burned-in, platform player) — otherwise this fails 1.2.2.',
      page: url,
      targets: [media.selector],
    })
  }

  // 2.5.7 / 2.1.1 custom sliders must respond to arrow keys → violation when they don't
  for (const slider of content.sliders.filter((s) => !s.native)) {
    const operable = await page.evaluate((selector) => {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) return true
      el.focus({ preventScroll: true })
      const before = el.getAttribute('aria-valuenow')
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      const after = el.getAttribute('aria-valuenow')
      el.blur()
      return before !== after
    }, slider.selector)
    if (!operable) {
      findings.push({
        engine: 'keyboard',
        ruleId: 'slider-keyboard-inoperable',
        impact: 'serious',
        wcag: ['2.5.7', '2.1.1'],
        description: 'Custom slider does not respond to arrow keys — the drag interaction has no keyboard alternative.',
        page: url,
        targets: [slider.selector],
      })
    }
  }

  const evidence: EvidencePacket[] = [
    { sc: '2.4.6', kind: 'headings', items: content.headings.map((h) => ({ page: url, selector: h.selector, text: h.text })) },
    { sc: '3.3.2', kind: 'labels', items: content.labels.map((l) => ({ page: url, selector: l.selector, text: `"${l.text}" → ${l.control}` })) },
    { sc: '1.2.2', kind: 'media', items: content.media.map((m) => ({ page: url, selector: m.selector, text: m.hasCaptionTrack ? 'has caption track' : 'no caption track' })) },
  ].filter((packet) => packet.items.length > 0)

  return { findings, evidence }
}

/**
 * 1.4.13 hover-content probe: for detectable tooltip triggers, verify revealed
 * content is Esc-dismissible. Hovering is a low-risk interaction, so this runs
 * by default; failures are violations (Esc dismissal has no exceptions).
 */
export const runHoverProbe = async (page: Page, url: string, cap = 8): Promise<Finding[]> => {
  const triggers = await page.evaluate((max) =>
    Array.from(document.querySelectorAll<HTMLElement>('[aria-describedby], [data-tooltip], [data-tippy-content]'))
      .filter((el) => {
        const id = el.getAttribute('aria-describedby')
        const target = id ? document.getElementById(id.split(/\s+/)[0]) : null
        return target === null || target.getBoundingClientRect().height === 0 || getComputedStyle(target).display === 'none'
      })
      .slice(0, max)
      .map((el) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[aria-describedby="${el.getAttribute('aria-describedby') ?? ''}"]`)),
    cap,
  )

  const findings: Finding[] = []
  for (const selector of triggers) {
    try {
      const locator = page.locator(selector).first()
      await locator.hover({ timeout: 2000 })
      await page.waitForTimeout(300)
      const appeared = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        const id = el?.getAttribute('aria-describedby')?.split(/\s+/)[0]
        const target = id ? document.getElementById(id) : null
        return target !== null && target.getBoundingClientRect().height > 0 && getComputedStyle(target).visibility !== 'hidden'
      }, selector)
      if (!appeared) continue
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      const stillVisible = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        const id = el?.getAttribute('aria-describedby')?.split(/\s+/)[0]
        const target = id ? document.getElementById(id) : null
        return target !== null && target.getBoundingClientRect().height > 0 && getComputedStyle(target).visibility !== 'hidden'
      }, selector)
      if (stillVisible) {
        findings.push({
          engine: 'keyboard',
          ruleId: 'hover-content-not-dismissible',
          impact: 'serious',
          wcag: ['1.4.13'],
          description: 'Content revealed on hover cannot be dismissed with Escape — it must be dismissable without moving the pointer.',
          page: url,
          targets: [selector],
        })
      }
      await page.mouse.move(0, 0)
    } catch {
      /* trigger not hoverable in this state — skip */
    }
  }
  return findings
}
