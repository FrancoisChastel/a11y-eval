import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { basename, join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { mergeManualReview } from '../merge.ts'
import { renderMarkdown } from '../report.ts'
import type { ManualReview, Report } from '../types.ts'
import { renderReviewHtml } from './render.ts'

const MAX_BODY_BYTES = 5 * 1024 * 1024

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })

const send = (res: ServerResponse, status: number, body: string | Buffer, type = 'application/json'): void => {
  res.writeHead(status, { 'content-type': type })
  res.end(body)
}

/**
 * Local review server: serves the review page with autosave, element screenshots
 * (via the already-installed Playwright), and finalize-merge. Binds to loopback
 * only — this is a reviewer's local tool, not a service.
 */
export const startReviewServer = async (reportDir: string, port: number): Promise<void> => {
  const reportPath = join(reportDir, 'report.json')
  if (!existsSync(reportPath)) throw new Error(`No report.json in ${reportDir} — run an evaluation first.`)
  const manualPath = join(reportDir, 'manual-review.json')
  const evidenceDir = join(reportDir, 'evidence')
  await mkdir(evidenceDir, { recursive: true })

  let browser: Browser | undefined
  const getBrowser = async (): Promise<Browser> => (browser ??= await chromium.launch())

  const loadReport = async (): Promise<Report> => JSON.parse(await readFile(reportPath, 'utf8'))
  const loadManual = async (): Promise<ManualReview | null> => {
    try {
      return JSON.parse(await readFile(manualPath, 'utf8'))
    } catch {
      return null
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'GET' && url.pathname === '/') {
        const report = await loadReport()
        send(res, 200, renderReviewHtml(report, { served: true, manual: await loadManual() }), 'text/html; charset=utf-8')
      } else if (req.method === 'GET' && url.pathname === '/api/manual-review') {
        const manual = await loadManual()
        send(res, manual ? 200 : 404, JSON.stringify(manual))
      } else if (req.method === 'PUT' && url.pathname === '/api/manual-review') {
        const manual = JSON.parse(await readBody(req)) as ManualReview
        await writeFile(manualPath, JSON.stringify(manual, null, 2))
        send(res, 200, '{"saved":true}')
      } else if (req.method === 'POST' && url.pathname === '/api/screenshot') {
        const { url: target, selector } = JSON.parse(await readBody(req)) as { url: string; selector?: string }
        const report = await loadReport()
        if (!report.pages.some((p) => p.url === target)) {
          send(res, 403, JSON.stringify({ error: 'URL is not part of this evaluation' }))
          return
        }
        const page = await (await getBrowser()).newPage({ viewport: { width: 1280, height: 900 } })
        try {
          await page.goto(target, { waitUntil: 'networkidle', timeout: 20_000 })
          const name = `shot-${Date.now()}.png`
          const path = join(evidenceDir, name)
          if (selector) await page.locator(selector).first().screenshot({ path, timeout: 5_000 })
          else await page.screenshot({ path, fullPage: false })
          send(res, 200, JSON.stringify({ path: `evidence/${name}` }))
        } finally {
          await page.close()
        }
      } else if (req.method === 'GET' && url.pathname.startsWith('/evidence/')) {
        const file = join(evidenceDir, basename(url.pathname))
        if (!existsSync(file)) send(res, 404, '{"error":"not found"}')
        else send(res, 200, await readFile(file), 'image/png')
      } else if (req.method === 'POST' && url.pathname === '/api/merge') {
        const manual = JSON.parse(await readBody(req)) as ManualReview
        await writeFile(manualPath, JSON.stringify(manual, null, 2))
        const merged = mergeManualReview(await loadReport(), manual)
        await writeFile(join(reportDir, 'final-report.json'), JSON.stringify(merged, null, 2))
        await writeFile(join(reportDir, 'final-report.md'), renderMarkdown(merged))
        send(res, 200, JSON.stringify({ overall: merged.overall, score: merged.score, totals: merged.totals, out: join(reportDir, 'final-report.md') }))
      } else {
        send(res, 404, '{"error":"not found"}')
      }
    } catch (error) {
      send(res, 500, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  console.log(`Review UI: http://127.0.0.1:${port}/  (autosaving to ${manualPath})`)

  const shutdown = async (): Promise<void> => {
    server.close()
    await browser?.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
