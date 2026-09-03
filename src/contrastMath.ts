/**
 * WCAG contrast arithmetic — the math a Colour Contrast Analyser performs,
 * browser-free so every rule is unit-testable. The cca engine feeds it computed
 * foreground colors and background pixels sampled from screenshots.
 */

export interface Rgb {
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

/** Parses the computed-style forms browsers emit: rgb(r, g, b) / rgba(r, g, b, a). */
export const parseCssColor = (css: string): Rgb | null => {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(css)
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) }
}

const channel = (value: number): number => {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance. */
export const luminance = (c: Rgb): number => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)

/** WCAG contrast ratio, 1..21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const l1 = luminance(a)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Alpha-composites fg over bg (fg.a < 1 means the text lets the background through). */
export const composite = (fg: Rgb, bg: Rgb): Rgb => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
})

/** WCAG 1.4.3: 3:1 for large text (≥24px, or ≥18.66px bold), else 4.5:1. */
export const requiredRatio = (fontSizePx: number, fontWeight: number): number =>
  fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5

export interface WorstContrast {
  minRatio: number
  /** Pixel index (x + y*width) of the worst-case background pixel. */
  atIndex: number
  samples: number
}

/** Keeps background pixels changed by rendering text and makes every other pixel transparent. */
export const pixelsUnderRenderedText = (
  background: Uint8Array | Buffer,
  rendered: Uint8Array | Buffer,
  minRgbDelta = 12,
): Uint8Array => {
  if (background.length !== rendered.length) throw new RangeError('Rendered and background samples must have equal dimensions')

  const sampled = Uint8Array.from(background)
  for (let i = 0; i < sampled.length; i += 4) {
    const delta =
      Math.abs(rendered[i] - background[i]) +
      Math.abs(rendered[i + 1] - background[i + 1]) +
      Math.abs(rendered[i + 2] - background[i + 2])
    if (delta < minRgbDelta) sampled[i + 3] = 0
  }
  return sampled
}

/**
 * Contrast of a foreground color against every opaque pixel of a background
 * sample (RGBA buffer), returning the worst case — "contrast at its worst
 * point", per how CCA is used on gradients and images.
 */
export const worstCaseContrast = (fg: Rgb, rgba: Uint8Array | Buffer, stride = 1): WorstContrast => {
  let minRatio = Infinity
  let atIndex = -1
  let samples = 0
  for (let i = 0; i < rgba.length; i += 4 * stride) {
    if (rgba[i + 3] < 250) continue // skip transparent/antialiased edge pixels
    const bg: Rgb = { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: 1 }
    const effectiveFg = fg.a < 1 ? composite(fg, bg) : fg
    const ratio = contrastRatio(effectiveFg, bg)
    samples += 1
    if (ratio < minRatio) {
      minRatio = ratio
      atIndex = i / 4
    }
  }
  return { minRatio: samples === 0 ? NaN : minRatio, atIndex, samples }
}

export type ContrastVerdict = 'fail' | 'pass' | 'borderline'

/** Small epsilon band around the threshold becomes a suspect instead of a hard call. */
export const judgeContrast = (minRatio: number, required: number, epsilon = 0.05): ContrastVerdict => {
  if (Number.isNaN(minRatio)) return 'borderline'
  if (minRatio < required - epsilon) return 'fail'
  if (minRatio > required + epsilon) return 'pass'
  return 'borderline'
}
