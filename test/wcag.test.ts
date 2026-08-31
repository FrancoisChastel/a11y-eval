import { describe, expect, test } from 'vitest'
import { MANUAL_CHECKLIST, tagsToCriteria } from '../src/wcag.ts'

describe('tagsToCriteria', () => {
  test('parses single-digit criterion tags', () => {
    expect(tagsToCriteria(['wcag143'])).toEqual(['1.4.3'])
    expect(tagsToCriteria(['wcag412'])).toEqual(['4.1.2'])
  })

  test('parses double-digit criterion tags', () => {
    expect(tagsToCriteria(['wcag1410'])).toEqual(['1.4.10'])
    expect(tagsToCriteria(['wcag2511'])).toEqual(['2.5.11'])
  })

  test('ignores level and category tags', () => {
    expect(tagsToCriteria(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice', 'cat.forms'])).toEqual([])
  })

  test('combines and dedupes across tags', () => {
    expect(tagsToCriteria(['wcag2aa', 'wcag143', 'wcag143', 'wcag111'])).toEqual(['1.4.3', '1.1.1'])
  })
})

describe('MANUAL_CHECKLIST', () => {
  test('every entry has a valid SC number, name, and reason', () => {
    expect(MANUAL_CHECKLIST.length).toBeGreaterThanOrEqual(10)
    for (const item of MANUAL_CHECKLIST) {
      expect(item.sc).toMatch(/^[1-4]\.\d\.\d{1,2}$/)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.why.length).toBeGreaterThan(0)
    }
  })

  test('covers known automation blind spots', () => {
    const scs = MANUAL_CHECKLIST.map((i) => i.sc)
    expect(scs).toContain('1.4.13') // content on hover/focus
    expect(scs).toContain('2.4.3') // focus order meaningfulness
    expect(scs).toContain('2.5.7') // dragging movements
    expect(scs).toContain('3.2.2') // on input
  })
})
