import { describe, expect, test } from 'vitest'
import { inScope, normalizeUrl } from '../src/crawl.ts'

describe('normalizeUrl', () => {
  test('resolves relative links against the current page', () => {
    expect(normalizeUrl('page2.html', 'http://localhost:3000/index.html')).toBe('http://localhost:3000/page2.html')
    expect(normalizeUrl('/settings', 'http://localhost:3000/deep/page')).toBe('http://localhost:3000/settings')
  })

  test('strips fragments so anchors dedupe to their page', () => {
    expect(normalizeUrl('http://x.test/a#section', 'http://x.test/')).toBe('http://x.test/a')
  })

  test('rejects non-navigable schemes', () => {
    expect(normalizeUrl('mailto:a@b.c', 'http://x.test/')).toBeNull()
    expect(normalizeUrl('javascript:void(0)', 'http://x.test/')).toBeNull()
    expect(normalizeUrl('tel:+123', 'http://x.test/')).toBeNull()
  })

  test('returns null for unparseable input', () => {
    expect(normalizeUrl('http://[broken', 'http://x.test/')).toBeNull()
  })
})

describe('inScope', () => {
  test('http scope is same-origin', () => {
    expect(inScope('http://x.test/anything', 'http://x.test/')).toBe(true)
    expect(inScope('http://x.test:8080/', 'http://x.test/')).toBe(false)
    expect(inScope('https://example.com/', 'http://x.test/')).toBe(false)
  })

  test('file scope is the seed directory subtree', () => {
    expect(inScope('file:///site/page2.html', 'file:///site/index.html')).toBe(true)
    expect(inScope('file:///site/sub/deep.html', 'file:///site/index.html')).toBe(true)
    expect(inScope('file:///elsewhere/x.html', 'file:///site/index.html')).toBe(false)
  })
})
