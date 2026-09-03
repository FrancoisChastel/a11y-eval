import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { runKeyboardChecks } from '../src/engines/keyboard.ts'

describe('runKeyboardChecks', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  test('flags click-only controls but ignores disabled, aria-hidden, and structural targets', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <style>button, div { display: block; width: 100px; height: 30px; }</style>
      <button id="enabled">Enabled</button>
      <button id="disabled" disabled>Disabled</button>
      <div id="aria-disabled" role="button" aria-disabled="true">ARIA disabled</div>
      <div id="drawer" tabindex="-1">Drawer</div>
      <div aria-hidden="true"><i id="guard" tabindex="0"></i></div>
      <div role="tablist"><button id="managed-tab" role="tab" tabindex="-1">Managed tab</button></div>
      <div id="click-only" onclick="void 0">Click only</div>
    `)

    const findings = await runKeyboardChecks(page, page.url(), 0)
    const unreachable = findings.filter((finding) => finding.ruleId === 'keyboard-unreachable')

    expect(unreachable).toHaveLength(1)
    expect(unreachable[0].targets).toEqual(['div#click-only'])
    await page.close()
  })

  test('checks focus indicators reached through real Tab navigation', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(`
      <style>
        button { appearance: none; background: white; border: 1px solid black; outline: none; }
        #visible:focus-visible { outline: 3px solid red; }
      </style>
      <button id="visible">Visible focus</button>
      <button id="missing">Missing focus</button>
    `)

    const findings = await runKeyboardChecks(page, page.url())
    const missingFocus = findings.filter((finding) => finding.ruleId === 'focus-not-visible')

    expect(missingFocus).toHaveLength(1)
    expect(missingFocus[0].targets).toEqual(['button#missing'])
    await page.close()
  })
})