import { describe, expect, test } from 'vitest'
import { composite, contrastRatio, judgeContrast, parseCssColor, requiredRatio, worstCaseContrast } from '../src/contrastMath.ts'

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })

const pixels = (colors: [number, number, number, number][]): Buffer => Buffer.from(colors.flat())

describe('contrast math', () => {
  test('parses computed-style colors including alpha', () => {
    expect(parseCssColor('rgb(255, 255, 255)')).toEqual(rgb(255, 255, 255))
    expect(parseCssColor('rgba(17, 17, 17, 0.5)')).toEqual(rgb(17, 17, 17, 0.5))
    expect(parseCssColor('#fff')).toBeNull()
  })

  test('known WCAG ratios: black/white 21:1, #767676/white ≈ 4.54:1', () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 1)
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), rgb(255, 255, 255))).toBeCloseTo(4.54, 1)
  })

  test('required ratio: large text and bold thresholds', () => {
    expect(requiredRatio(16, 400)).toBe(4.5)
    expect(requiredRatio(24, 400)).toBe(3)
    expect(requiredRatio(19, 700)).toBe(3)
    expect(requiredRatio(19, 400)).toBe(4.5)
  })

  test('worst-case sampling finds the failing pixel of a gradient', () => {
    // white text over a white→black gradient: worst against white (1:1), best against black
    const gradient = pixels([
      [255, 255, 255, 255],
      [128, 128, 128, 255],
      [0, 0, 0, 255],
    ])
    const worst = worstCaseContrast(rgb(255, 255, 255), gradient)
    expect(worst.minRatio).toBeCloseTo(1, 3)
    expect(worst.atIndex).toBe(0)
    expect(worst.samples).toBe(3)
  })

  test('transparent pixels are skipped; semi-transparent fg composites over bg', () => {
    const onlyTransparent = pixels([[10, 10, 10, 100]])
    expect(Number.isNaN(worstCaseContrast(rgb(0, 0, 0), onlyTransparent).minRatio)).toBe(true)

    const white = pixels([[255, 255, 255, 255]])
    // 50%-alpha black over white = mid grey → far less than 21:1
    const withAlpha = worstCaseContrast(rgb(0, 0, 0, 0.5), white)
    expect(withAlpha.minRatio).toBeLessThan(6)
    expect(composite(rgb(0, 0, 0, 0.5), rgb(255, 255, 255)).r).toBeCloseTo(127.5, 1)
  })

  test('judgeContrast: fail/pass with a borderline epsilon band', () => {
    expect(judgeContrast(2.1, 4.5)).toBe('fail')
    expect(judgeContrast(7.2, 4.5)).toBe('pass')
    expect(judgeContrast(4.5, 4.5)).toBe('borderline')
    expect(judgeContrast(NaN, 4.5)).toBe('borderline')
  })
})
