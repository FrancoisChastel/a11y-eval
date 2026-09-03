import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { runTargetSizeCheck } from '../src/engines/geometry.ts'

describe('runTargetSizeCheck', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  test('does not duplicate definitive axe target-size failures', async () => {
    const page = await browser.newPage()
    await page.setContent(`
      <style>a { display: block; height: 18px; }</style>
      <a id="one" href="#one">One</a>
      <a id="two" href="#two">Two</a>
    `)

    expect(await runTargetSizeCheck(page, page.url())).toHaveLength(2)
    expect(await runTargetSizeCheck(page, page.url(), ['a#one', 'a#two'])).toHaveLength(0)
    await page.close()
  })
})