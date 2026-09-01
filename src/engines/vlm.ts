import type { Page } from 'playwright'
import type { FocusStop } from '../checks.ts'
import type { ContentSignals, EvidencePacket, Finding } from '../types.ts'
import { callLlm, type LlmBackend, type LlmImage } from './adjudicate.ts'
import type { AxeIncompleteItem } from './axe.ts'

/**
 * Vision checks (--vlm), organized in three tiers with distinct handling:
 *
 *  Tier 1 — FLAG:    violations become engine:'vlm' SUSPECT findings (review UI
 *                    suspect panels, --strict gating). Checks: alt-text quality,
 *                    color-only meaning (grayscale pair), focus-order overlay,
 *                    axe-incomplete contrast triage.
 *  Tier 2 — PREFILL: observations become evidence-packet items (kind
 *                    'vlm-observation') under their criterion — concerns marked,
 *                    never findings. Checks: 320px reflow overlap, hover
 *                    occlusion, visual label association.
 *  Tier 3 — ENRICH:  media keyframe observations attach to 1.2.2/1.2.5, which sit
 *                    outside adjudication by construction — a structural
 *                    needs-expert ceiling no VLM output can cross.
 *
 * Every check records an evidence item either way, so coverage stays visible.
 * Per-check API failures are collected as notes (a gap, never a silent pass).
 */

const MAX_ALT_IMAGES = 5
const MAX_CONTRAST_ITEMS = 4
const MAX_MEDIA_ITEMS = 2
const OVERLAY_MAX_HEIGHT = 1800
const CONSERVATIVE =
  'Be conservative: report a problem only when the image clearly shows it; when unsure, say it is fine. Respond with ONLY the requested JSON.'

export interface VlmContext {
  stops: FocusStop[]
  incompleteItems: AxeIncompleteItem[]
  signals: ContentSignals
}

export interface VlmResult {
  findings: Finding[]
  evidence: EvidencePacket[]
  notes: string[]
}

const png = (buffer: Buffer): LlmImage => ({ base64: buffer.toString('base64'), mediaType: 'image/png' })

export const extractJson = <T>(text: string): T | null => {
  const match = text.match(/[[{][\s\S]*[\]}]/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

const suspect = (ruleId: string, sc: string, impact: 'serious' | 'moderate', description: string, page: string, target: string): Finding => ({
  engine: 'vlm',
  ruleId,
  impact,
  wcag: [sc],
  confidence: 'suspect',
  description,
  page,
  targets: [target],
})

const packet = (sc: string, url: string, text: string, selector?: string): EvidencePacket => ({
  sc,
  kind: 'vlm-observation',
  items: [{ page: url, text, selector }],
})

/* ---------------- Tier 1 — flag as suspects ---------------- */

interface AltVerdict {
  index?: number
  adequate?: boolean
  reason?: string
  proposedAlt?: string
}

const checkAltQuality = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const candidates = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img[alt]:not([alt=""]):not([role="presentation"])'))
      .filter((img) => {
        const r = img.getBoundingClientRect()
        return r.width >= 40 && r.height >= 40
      })
      .map((img, i) => ({
        selector: img.id ? `img#${img.id}` : `img[src="${img.getAttribute('src') ?? ''}"]`,
        alt: img.alt,
        context: (img.closest('figure, section, article, main')?.querySelector('h1,h2,h3,figcaption')?.textContent ?? '').trim().slice(0, 120),
        index: i,
      })),
  )
  const sample = candidates.slice(0, MAX_ALT_IMAGES)
  if (sample.length === 0) {
    out.evidence.push(packet('1.1.1', url, 'VLM alt-quality: no sizeable images with alt text to judge on this page.'))
    return
  }
  const images: LlmImage[] = []
  const described: typeof sample = []
  for (const c of sample) {
    try {
      images.push(png(await page.locator(c.selector).first().screenshot({ timeout: 3000 })))
      described.push(c)
    } catch {
      /* not screenshotable */
    }
  }
  if (described.length === 0) return
  const prompt =
    `Images are numbered 0..${described.length - 1} in order. For each, judge whether its alt text conveys the information a sighted user gets from the image (axe already checked presence — you judge ADEQUACY).\n` +
    described.map((c, i) => `Image ${i}: alt="${c.alt}"${c.context ? ` (nearby heading/caption: "${c.context}")` : ''}`).join('\n') +
    `\n${CONSERVATIVE}\nJSON: [{"index":0,"adequate":true,"reason":"…","proposedAlt":"only when inadequate"}]`
  const verdicts = extractJson<AltVerdict[]>(await callLlm({ text: prompt, images }, backend))
  if (!Array.isArray(verdicts)) {
    out.notes.push('alt-quality: unparseable VLM response')
    return
  }
  let flagged = 0
  for (const v of verdicts) {
    const c = typeof v.index === 'number' ? described[v.index] : undefined
    if (!c || v.adequate !== false) continue
    flagged += 1
    out.findings.push(
      suspect('vlm-alt-quality-suspect', '1.1.1', 'serious', `Alt text "${c.alt}" may not convey the image's information: ${v.reason ?? 'inadequate per VLM'}.${v.proposedAlt ? ` Proposed alt: "${v.proposedAlt}"` : ''}`, url, c.selector),
    )
  }
  out.evidence.push(packet('1.1.1', url, `VLM alt-quality: judged ${described.length} image(s), flagged ${flagged}.`))
}

const checkColorMeaning = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const color = await page.screenshot()
  await page.evaluate(() => {
    document.documentElement.style.filter = 'grayscale(1)'
  })
  const gray = await page.screenshot()
  await page.evaluate(() => {
    document.documentElement.style.filter = ''
  })
  const prompt =
    `Image 0 is a page in full color; image 1 is the exact same page desaturated to grayscale. Is there any MEANING (status, category, required-ness, chart series, link-vs-text distinction) that a user can read from image 0 but that is lost in image 1 — i.e. conveyed by color alone with no second cue (text, icon, underline, pattern)? Purely decorative color differences do not count.\n${CONSERVATIVE}\nJSON: {"colorOnlyMeaning":false,"where":"…","explanation":"…"}`
  const verdict = extractJson<{ colorOnlyMeaning?: boolean; where?: string; explanation?: string }>(
    await callLlm({ text: prompt, images: [png(color), png(gray)] }, backend),
  )
  if (!verdict) {
    out.notes.push('color-meaning: unparseable VLM response')
    return
  }
  if (verdict.colorOnlyMeaning === true) {
    out.findings.push(
      suspect('vlm-color-meaning-suspect', '1.4.1', 'serious', `Meaning appears to be conveyed by color alone (${verdict.where ?? 'unspecified location'}): ${verdict.explanation ?? ''} Verified via grayscale comparison.`, url, verdict.where ?? 'page'),
    )
    out.evidence.push(packet('1.4.1', url, `VLM grayscale comparison: color-only meaning suspected — ${verdict.where ?? ''}.`))
  } else {
    out.evidence.push(packet('1.4.1', url, 'VLM grayscale comparison: no color-only meaning detected on this page.'))
  }
}

const checkFocusOrderOverlay = async (page: Page, url: string, backend: LlmBackend, stops: FocusStop[], out: VlmResult): Promise<void> => {
  if (stops.length < 4) return
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const original = page.viewportSize()
  await page.setViewportSize({ width: original?.width ?? 1280, height: Math.min(Math.max(docHeight, 400), OVERLAY_MAX_HEIGHT) })
  await page.evaluate((overlayStops) => {
    const container = document.createElement('div')
    container.id = '__a11y_vlm_overlay'
    container.style.cssText = 'position:absolute;top:0;left:0;z-index:2147483647;pointer-events:none'
    overlayStops.forEach((stop, i) => {
      const badge = document.createElement('div')
      badge.textContent = String(i + 1)
      badge.style.cssText = `position:absolute;left:${stop.x}px;top:${stop.y}px;background:#c92a2a;color:#fff;font:bold 16px sans-serif;border-radius:50%;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid #fff`
      container.append(badge)
    })
    document.body.append(container)
  }, stops)
  const shot = await page.screenshot()
  await page.evaluate(() => document.getElementById('__a11y_vlm_overlay')?.remove())
  if (original) await page.setViewportSize(original)
  const prompt = `The numbered red badges show the keyboard Tab order of this page (1 = first stop). Considering the VISUAL layout — columns, groupings, reading direction — does this numbering follow the order a sighted user would read and operate the page? Minor deviations inside a coherent group are fine.\n${CONSERVATIVE}\nJSON: {"followsVisualOrder":true,"explanation":"…"}`
  const verdict = extractJson<{ followsVisualOrder?: boolean; explanation?: string }>(await callLlm({ text: prompt, images: [png(shot)] }, backend))
  if (!verdict) {
    out.notes.push('focus-order-overlay: unparseable VLM response')
    return
  }
  if (verdict.followsVisualOrder === false) {
    out.findings.push(suspect('vlm-focus-order-suspect', '2.4.3', 'moderate', `Tab order does not follow the visual reading order (VLM overlay judgment): ${verdict.explanation ?? ''}`, url, 'page'))
  }
  out.evidence.push(packet('2.4.3', url, `VLM overlay judgment on ${stops.length} tab stops: ${verdict.followsVisualOrder === false ? 'order does NOT follow visual layout — ' : 'order follows visual layout. '}${verdict.explanation ?? ''}`))
}

const checkContrastIncomplete = async (page: Page, url: string, backend: LlmBackend, items: AxeIncompleteItem[], out: VlmResult): Promise<void> => {
  const contrastItems = items.filter((i) => i.ruleId === 'color-contrast').slice(0, MAX_CONTRAST_ITEMS)
  if (contrastItems.length === 0) return
  const images: LlmImage[] = []
  const captured: AxeIncompleteItem[] = []
  for (const item of contrastItems) {
    try {
      images.push(png(await page.locator(item.target).first().screenshot({ timeout: 3000 })))
      captured.push(item)
    } catch {
      /* not screenshotable */
    }
  }
  if (captured.length === 0) return
  const prompt =
    `axe-core could not compute the text contrast of these elements (text over images/gradients). Images are numbered 0..${captured.length - 1}. For each, judge whether the text is clearly readable against its actual background at its worst point (rough WCAG bar: 4.5:1 for normal text, 3:1 for large text).\n` +
    captured.map((c, i) => `Image ${i}: ${c.html.slice(0, 100)}`).join('\n') +
    `\n${CONSERVATIVE}\nJSON: [{"index":0,"sufficient":true,"explanation":"…"}]`
  const verdicts = extractJson<{ index?: number; sufficient?: boolean; explanation?: string }[]>(await callLlm({ text: prompt, images }, backend))
  if (!Array.isArray(verdicts)) {
    out.notes.push('contrast-triage: unparseable VLM response')
    return
  }
  let flagged = 0
  for (const v of verdicts) {
    const c = typeof v.index === 'number' ? captured[v.index] : undefined
    if (!c || v.sufficient !== false) continue
    flagged += 1
    out.findings.push(suspect('vlm-contrast-suspect', '1.4.3', 'serious', `Text appears to have insufficient contrast against its background (axe marked this undecidable): ${v.explanation ?? ''}`, url, c.target))
  }
  out.evidence.push(packet('1.4.3', url, `VLM contrast triage of ${captured.length} axe-incomplete element(s), flagged ${flagged}.`))
}

/* ---------------- Tier 2 — prefill observations ---------------- */

const observeIssues = async (
  page: Page,
  url: string,
  backend: LlmBackend,
  out: VlmResult,
  sc: string,
  label: string,
  images: LlmImage[],
  question: string,
): Promise<void> => {
  const prompt = `${question}\n${CONSERVATIVE}\nJSON: {"issues":["one short sentence per clear problem; empty array when none"]}`
  const verdict = extractJson<{ issues?: string[] }>(await callLlm({ text: prompt, images }, backend))
  if (!verdict || !Array.isArray(verdict.issues)) {
    out.notes.push(`${label}: unparseable VLM response`)
    return
  }
  const text =
    verdict.issues.length === 0
      ? `VLM ${label}: no visual problems observed.`
      : `CONCERN — VLM ${label}: ${verdict.issues.slice(0, 4).join(' · ')}`
  out.evidence.push(packet(sc, url, text))
}

const checkReflow = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const original = page.viewportSize()
  await page.setViewportSize({ width: 320, height: 900 })
  const shot = await page.screenshot()
  if (original) await page.setViewportSize(original)
  await observeIssues(page, url, backend, out, '1.4.10', 'reflow (320px)', [png(shot)], 'This page is rendered at a 320 CSS px viewport. Beyond needing to scroll vertically (which is fine), is any content overlapping, clipped, truncated mid-word, or squeezed to unusable?')
}

const checkHoverOcclusion = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const trigger = page.locator('[aria-describedby], [data-tooltip], [data-tippy-content]').first()
  if ((await trigger.count()) === 0) return
  const before = await page.screenshot()
  try {
    await trigger.hover({ timeout: 2000 })
    await page.waitForTimeout(400)
  } catch {
    return
  }
  const after = await page.screenshot()
  await page.mouse.move(0, 0)
  await observeIssues(page, url, backend, out, '1.4.13', 'hover occlusion', [png(before), png(after)], 'Image 0 is a page; image 1 is the same page while hovering an element that reveals content. Does the revealed content occlude (cover) other meaningful content or controls the user might need while it is open?')
}

const checkLabelAssociation = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const region = (await page.locator('form').count()) > 0 ? page.locator('form').first() : page.locator('main').first()
  if ((await region.count()) === 0) return
  let shot: Buffer
  try {
    shot = await region.screenshot({ timeout: 3000 })
  } catch {
    return
  }
  await observeIssues(page, url, backend, out, '3.3.2', 'visual label association', [png(shot)], 'This is a form region as sighted users see it. Does every visible input have a clearly associated, adjacent label (not just placeholder text inside the field)? Is any label visually distant from, or ambiguous about, which field it belongs to?')
}

/* ---------------- Tier 3 — enrich with a needs-expert ceiling ---------------- */

const checkMediaKeyframes = async (page: Page, url: string, backend: LlmBackend, out: VlmResult): Promise<void> => {
  const count = Math.min(await page.locator('video').count(), MAX_MEDIA_ITEMS)
  for (let i = 0; i < count; i += 1) {
    let shot: Buffer
    try {
      shot = await page.locator('video').nth(i).screenshot({ timeout: 3000 })
    } catch {
      continue
    }
    const prompt = `This is a frame of a video on a web page. Briefly describe what visual information it appears to convey, and whether it looks like content whose visuals/speech would need captions and audio description (vs. purely decorative motion). You are providing a spot-check observation only — a human must watch the video for any verdict.\n${CONSERVATIVE}\nJSON: {"description":"…","looksLikeContent":true}`
    const verdict = extractJson<{ description?: string; looksLikeContent?: boolean }>(await callLlm({ text: prompt, images: [png(shot)] }, backend))
    if (!verdict) {
      out.notes.push('media-keyframes: unparseable VLM response')
      continue
    }
    const text = `VLM keyframe spot-check (ceiling: needs-expert — a human must watch the video): ${verdict.description ?? 'no description'}${verdict.looksLikeContent === false ? ' Appears decorative.' : ''}`
    out.evidence.push(packet('1.2.2', url, text, `video #${i + 1}`))
    out.evidence.push(packet('1.2.5', url, text, `video #${i + 1}`))
  }
}

/* ---------------- orchestrator ---------------- */

export const runVlmChecks = async (page: Page, url: string, backend: LlmBackend, context: VlmContext): Promise<VlmResult> => {
  const out: VlmResult = { findings: [], evidence: [], notes: [] }
  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (error) {
      out.notes.push(`${label}: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
    }
  }

  // Tier 1 — flag
  await run('alt-quality', () => checkAltQuality(page, url, backend, out))
  await run('color-meaning', () => checkColorMeaning(page, url, backend, out))
  await run('focus-order-overlay', () => checkFocusOrderOverlay(page, url, backend, context.stops, out))
  await run('contrast-triage', () => checkContrastIncomplete(page, url, backend, context.incompleteItems, out))
  // Tier 2 — prefill
  await run('reflow', () => checkReflow(page, url, backend, out))
  await run('hover-occlusion', () => checkHoverOcclusion(page, url, backend, out))
  if (context.signals.forms > 0) await run('label-association', () => checkLabelAssociation(page, url, backend, out))
  // Tier 3 — enrich
  if (context.signals.media > 0) await run('media-keyframes', () => checkMediaKeyframes(page, url, backend, out))

  return out
}
