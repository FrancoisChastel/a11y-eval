import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { collectSignals } from '../src/engines/signals.ts'

describe('collectSignals', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  test('counts described tooltips and custom sliders for manual-review applicability', async () => {
    const page = await browser.newPage()
    await page.setContent(`
      <button aria-describedby="tip">Help</button>
      <div id="tip" role="tooltip" hidden>More information</div>
      <div role="slider" tabindex="0" aria-label="Volume" aria-valuenow="50"></div>
    `)

    const signals = await collectSignals(page)

    expect(signals.hoverContent).toBe(1)
    expect(signals.drag).toBe(1)
    await page.close()
  })
})