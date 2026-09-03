import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { runInteractProbes } from '../src/engines/interact.ts'

describe('runInteractProbes', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  test('allows query-only filtering but flags a change to another route', async () => {
    const page = await browser.newPage()
    await page.route('http://example.test/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <label><input id="filter" type="checkbox"> Filter results</label>
          <label><input id="navigate" type="checkbox"> Open another view</label>
          <script>
            filter.addEventListener('change', () => history.pushState({}, '', '?status=active'))
            navigate.addEventListener('change', () => history.pushState({}, '', '/another-view'))
          </script>
        `,
      })
    })
    await page.goto('http://example.test/filters')

    const findings = await runInteractProbes(page, page.url())
    const contextChanges = findings.filter((finding) => finding.ruleId === 'on-input-context-change')

    expect(contextChanges).toHaveLength(1)
    expect(contextChanges[0].targets).toEqual(['input#navigate'])
    await page.close()
  })
})