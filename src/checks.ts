/**
 * Pure logic for the Wave-1 deterministic checks. Kept browser-free so every
 * decision rule is unit-testable; the engines feed these functions with data
 * extracted via Playwright.
 */

export const MIN_TARGET_SIZE = 24
const SPACING_RADIUS = MIN_TARGET_SIZE / 2

export interface TargetBox {
  selector: string
  x: number
  y: number
  width: number
  height: number
  /** Rendered inline within flowing text — exempt from 2.5.8. */
  inline: boolean
}

export const circleIntersectsRect = (
  cx: number,
  cy: number,
  radius: number,
  rect: { x: number; y: number; width: number; height: number },
): boolean => {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width))
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height))
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius ** 2
}

export interface TargetSizeSuspect {
  selector: string
  width: number
  height: number
  overlaps: string[]
}

/**
 * WCAG 2.5.8 Target Size (Minimum): a target passes when ≥24×24, when inline in
 * a sentence, or when a 24px circle centered on it touches no other target
 * (spacing exception). Failures are suspects — the "equivalent control elsewhere"
 * exception cannot be detected mechanically.
 */
export const analyzeTargetSizes = (targets: TargetBox[]): TargetSizeSuspect[] => {
  const suspects: TargetSizeSuspect[] = []
  for (const target of targets) {
    if (target.inline) continue
    if (target.width >= MIN_TARGET_SIZE && target.height >= MIN_TARGET_SIZE) continue
    const cx = target.x + target.width / 2
    const cy = target.y + target.height / 2
    const overlaps = targets
      .filter((other) => other !== target && circleIntersectsRect(cx, cy, SPACING_RADIUS, other))
      .map((other) => other.selector)
    if (overlaps.length > 0) {
      suspects.push({ selector: target.selector, width: target.width, height: target.height, overlaps })
    }
  }
  return suspects
}

export interface FocusStop {
  selector: string
  x: number
  y: number
  height: number
}

export interface OrderJump {
  from: string
  to: string
  upwardBy: number
}

/**
 * WCAG 2.4.3 heuristic: tab order should broadly follow reading order. A stop
 * whose element sits entirely ABOVE the previous stop is a strong out-of-order
 * signal (tabindex>0 misuse, CSS order flips, footer-first traps). Suspects only —
 * whether the jump breaks meaning is a judgment call.
 */
export const findOrderJumps = (stops: FocusStop[]): OrderJump[] => {
  const jumps: OrderJump[] = []
  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1]
    const next = stops[i]
    const upwardBy = prev.y - (next.y + next.height)
    if (upwardBy > 0) jumps.push({ from: prev.selector, to: next.selector, upwardBy: Math.round(upwardBy) })
  }
  return jumps
}

export interface SensoryMatch {
  phrase: string
  pattern: string
}

const SENSORY_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'color-referenced control',
    regex: /\b(?:click|press|select|tap|use|choose)\b[^.!?\n]{0,50}\b(?:green|red|blue|yellow|orange|purple|grey|gray)\b[^.!?\n]{0,40}\b(?:button|icon|link|box|tab|arrow)\b/gi,
  },
  {
    name: 'shape-referenced control',
    regex: /\b(?:click|press|select|tap|use|choose)\b[^.!?\n]{0,50}\b(?:round|square|circular|triangular)\b[^.!?\n]{0,40}\b(?:button|icon|link|box)\b/gi,
  },
  {
    name: 'position-only instruction',
    regex: /\b(?:button|link|icon|menu|box|panel|field)\b[^.!?\n]{0,20}\b(?:on|to) the (?:right|left)\b|\b(?:on|to) the (?:right|left)\b[^.!?\n]{0,25}\b(?:button|link|icon|menu|box|panel|field)\b/gi,
  },
  { name: 'sound-referenced instruction', regex: /\bwhen you hear\b[^.!?\n]{0,60}/gi },
]

/** WCAG 1.3.3 lexicon: instructional phrases that rely on color/shape/position/sound. */
export const findSensoryPhrases = (text: string): SensoryMatch[] => {
  const matches: SensoryMatch[] = []
  for (const { name, regex } of SENSORY_PATTERNS) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null && matches.length < 20) {
      matches.push({ phrase: match[0].trim().slice(0, 120), pattern: name })
    }
  }
  return matches
}

/** ISO 639-1 page langs → the ISO 639-3 codes franc emits. */
export const LANG_639_3: Record<string, string> = {
  en: 'eng', fr: 'fra', de: 'deu', es: 'spa', it: 'ita', pt: 'por', nl: 'nld',
  sv: 'swe', da: 'dan', no: 'nob', fi: 'fin', pl: 'pol', ru: 'rus', uk: 'ukr',
  ja: 'jpn', ko: 'kor', zh: 'cmn', ar: 'arb', tr: 'tur', cs: 'ces', el: 'ell',
}

/** Text blocks shorter than this are too noisy for language detection. */
export const LANG_DETECT_MIN_CHARS = 80

export const normalizePageLang = (lang: string | null | undefined): string | null => {
  const primary = lang?.toLowerCase().split('-')[0] ?? ''
  return LANG_639_3[primary] ?? null
}
