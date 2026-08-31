import type { BrowserContext } from 'playwright'

const SKIPPED_SCHEMES = /^(mailto|javascript|tel|data|blob|about):/i
const NON_HTML_EXTENSIONS = /\.(pdf|zip|png|jpe?g|gif|svg|webp|ico|css|js|json|xml|mp4|webm|woff2?)$/i

/** Resolve a link against its page and strip the fragment. Null for non-navigable links. */
export const normalizeUrl = (raw: string, base: string): string | null => {
  if (SKIPPED_SCHEMES.test(raw.trim())) return null
  try {
    const url = new URL(raw, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'file:') return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

/** http(s): same origin as the seed. file: within the seed's directory subtree. */
export const inScope = (candidate: string, seed: string): boolean => {
  try {
    const c = new URL(candidate)
    const s = new URL(seed)
    if (s.protocol === 'file:') {
      const seedDir = s.pathname.slice(0, s.pathname.lastIndexOf('/') + 1)
      return c.protocol === 'file:' && c.pathname.startsWith(seedDir)
    }
    return c.origin === s.origin
  } catch {
    return false
  }
}

export interface CrawlOptions {
  maxPages: number
  maxDepth: number
}

/**
 * Breadth-first same-scope link discovery. Returns pages in discovery order,
 * seeds first, capped at maxPages.
 */
export const discoverPages = async (
  context: BrowserContext,
  seeds: string[],
  { maxPages, maxDepth }: CrawlOptions,
): Promise<string[]> => {
  const visited = new Set<string>()
  const queue: { url: string; depth: number }[] = []

  for (const seed of seeds) {
    const normalized = normalizeUrl(seed, seed)
    if (normalized && !visited.has(normalized)) {
      visited.add(normalized)
      queue.push({ url: normalized, depth: 0 })
    }
  }

  const discovered: string[] = []
  while (queue.length > 0 && discovered.length < maxPages) {
    const { url, depth } = queue.shift()!
    discovered.push(url)
    if (depth >= maxDepth) continue

    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
      const hrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
      )
      for (const href of hrefs) {
        const normalized = normalizeUrl(href, url)
        if (!normalized || visited.has(normalized)) continue
        if (!seeds.some((seed) => inScope(normalized, seed))) continue
        if (NON_HTML_EXTENSIONS.test(new URL(normalized).pathname)) continue
        visited.add(normalized)
        queue.push({ url: normalized, depth: depth + 1 })
      }
    } catch {
      // Unreachable page: keep it in the report input so the evaluation surfaces the failure.
    } finally {
      await page.close()
    }
  }
  return discovered
}
