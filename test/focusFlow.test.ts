import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { runFocusFlowChecks } from '../src/engines/focusFlow.ts'

describe('runFocusFlowChecks', () => {
  let browser: Browser
  let server: Server
  let url: string

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html')
      response.end(`
        <button id="first">First</button>
        <i tabindex="0" aria-hidden="true" onfocus="document.querySelector('#first').focus()"></i>
        <button id="last">Last</button>
      `)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port')
    url = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  test('ignores aria-hidden focus guards and the normal Tab cycle', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.goto(url)

    const result = await runFocusFlowChecks(page, url)

    expect(result.findings.filter((finding) => finding.ruleId === 'on-focus-focus-theft')).toEqual([])
    expect(result.findings.filter((finding) => finding.ruleId === 'focus-order-suspect')).toEqual([])
    await page.close()
  })
})