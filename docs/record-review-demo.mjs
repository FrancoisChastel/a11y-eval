// Records docs/demo-review-ui.gif source video by driving the review UI.
// Usage: node docs/record-review-demo.mjs <path-to-review.html> <out.webm>
// Regenerate after UI changes, then convert with ffmpeg (see docs/demo-cli.tape header comment).
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const [reviewPath, outPath] = process.argv.slice(2)
if (!reviewPath || !outPath) {
  console.error('usage: node docs/record-review-demo.mjs <review.html> <out.webm>')
  process.exit(2)
}

const SIZE = { width: 1280, height: 800 }
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: '/tmp/a11y-demo-video', size: SIZE } })
const page = await context.newPage()

// Visible cursor dot so recorded clicks are followable.
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div')
    dot.style.cssText =
      'position:fixed;z-index:9999;width:14px;height:14px;border-radius:50%;background:#e2504c;border:2px solid #fff;pointer-events:none;transform:translate(-50%,-50%);left:-40px;top:-40px;box-shadow:0 1px 4px rgba(0,0,0,.4)'
    document.body.append(dot)
    addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`
      dot.style.top = `${e.clientY}px`
    })
  })
})

const moveAndClick = async (locator) => {
  const box = await locator.boundingBox()
  const x = box.x + Math.min(box.width / 2, 140)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y, { steps: 25 })
  await pause(350)
  await page.mouse.click(x, y)
}

const scrollTo = async (locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await pause(1100)
}

await page.goto(pathToFileURL(resolve(reviewPath)).href, { waitUntil: 'networkidle' })
await pause(1800)

// 1. Automated results + remediation plan
await scrollTo(page.locator('#plan h2'))
await moveAndClick(page.locator('#plan details > summary').first())
await pause(1600)

// 2. Signal-suggested N/A on the first media criterion
const firstCriterion = page.locator('fieldset.criterion').first()
await scrollTo(firstCriterion)
await pause(700)
await moveAndClick(firstCriterion.locator('.suggestion button'))
await pause(1400)

// 3. Fail 2.4.3 Focus Order with typed evidence
const focusOrder = page.locator('fieldset.criterion', { has: page.locator('legend', { hasText: '2.4.3' }) })
await scrollTo(focusOrder)
await moveAndClick(focusOrder.locator('input[value="fail"]'))
await pause(500)
const evidence = focusOrder.locator('textarea')
await moveAndClick(evidence)
await evidence.pressSequentially('Tab order jumps to the footer mid-form on flawed.html.', { delay: 28 })
await pause(900)

// 4. Progress + export in the sticky footer
await scrollTo(page.locator('#app-footer button').first())
await page.mouse.move(640, 740, { steps: 15 })
await pause(2200)

await context.close()
const video = page.video()
await video.saveAs(outPath)
await browser.close()
console.log(`saved ${outPath}`)
