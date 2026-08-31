import { describe, expect, test } from 'vitest'
import {
  analyzeTargetSizes,
  circleIntersectsRect,
  findOrderJumps,
  findSensoryPhrases,
  normalizePageLang,
  type TargetBox,
} from '../src/checks.ts'

const box = (over: Partial<TargetBox>): TargetBox => ({
  selector: 'a',
  x: 0,
  y: 0,
  width: 100,
  height: 18,
  inline: false,
  ...over,
})

describe('analyzeTargetSizes (2.5.8)', () => {
  test('stacked undersized targets with no gap are suspects (spacing exception fails)', () => {
    const suspects = analyzeTargetSizes([
      box({ selector: 'a.first', y: 0, height: 18 }),
      box({ selector: 'a.second', y: 18, height: 18 }),
    ])
    expect(suspects.map((s) => s.selector).sort()).toEqual(['a.first', 'a.second'])
    expect(suspects[0].overlaps.length).toBeGreaterThan(0)
  })

  test('undersized but well-spaced targets pass via the spacing exception', () => {
    const suspects = analyzeTargetSizes([
      box({ selector: 'a.first', y: 0, height: 18 }),
      box({ selector: 'a.second', y: 60, height: 18 }),
    ])
    expect(suspects).toEqual([])
  })

  test('24×24+ targets and inline targets are never suspects', () => {
    const suspects = analyzeTargetSizes([
      box({ selector: 'button', width: 44, height: 44 }),
      box({ selector: 'a.inline', y: 45, height: 16, inline: true }),
      box({ selector: 'a.also-inline', y: 46, height: 16, inline: true }),
    ])
    expect(suspects).toEqual([])
  })

  test('circle-rect intersection math', () => {
    expect(circleIntersectsRect(50, 27, 12, { x: 0, y: 36, width: 100, height: 18 })).toBe(true)
    expect(circleIntersectsRect(50, 9, 12, { x: 0, y: 60, width: 100, height: 18 })).toBe(false)
  })
})

describe('findOrderJumps (2.4.3)', () => {
  test('flags a stop that lands fully above its predecessor', () => {
    const jumps = findOrderJumps([
      { selector: '#a', x: 0, y: 100, height: 20 },
      { selector: '#footer-link', x: 0, y: 500, height: 20 },
      { selector: '#b', x: 0, y: 140, height: 20 },
    ])
    expect(jumps).toHaveLength(1)
    expect(jumps[0]).toMatchObject({ from: '#footer-link', to: '#b' })
  })

  test('normal top-to-bottom order produces no jumps', () => {
    const jumps = findOrderJumps([
      { selector: '#a', x: 0, y: 10, height: 20 },
      { selector: '#b', x: 200, y: 10, height: 20 },
      { selector: '#c', x: 0, y: 60, height: 20 },
    ])
    expect(jumps).toEqual([])
  })
})

describe('findSensoryPhrases (1.3.3)', () => {
  test('flags color, position, and sound instructions', () => {
    const text =
      'To continue, click the green button below. The settings menu is the icon on the right. When you hear the tone, speak.'
    const patterns = findSensoryPhrases(text).map((m) => m.pattern)
    expect(patterns).toContain('color-referenced control')
    expect(patterns).toContain('position-only instruction')
    expect(patterns).toContain('sound-referenced instruction')
  })

  test('does not flag neutral instructional text', () => {
    expect(findSensoryPhrases('Select "Save changes" to submit the form. Choose your country from the list.')).toEqual([])
  })
})

describe('normalizePageLang (3.1.2)', () => {
  test('maps ISO 639-1 (with region) to franc codes and null for unknown', () => {
    expect(normalizePageLang('en-US')).toBe('eng')
    expect(normalizePageLang('fr')).toBe('fra')
    expect(normalizePageLang('tlh')).toBeNull()
    expect(normalizePageLang(undefined)).toBeNull()
  })
})
