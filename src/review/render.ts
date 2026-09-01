import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ManualReview, Report } from '../types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Prevents `</script>` breakout when embedding JSON inside a script tag. */
const embedJson = (value: unknown): string => JSON.stringify(value).replaceAll('<', '\\u003c')

export interface RenderReviewOptions {
  served: boolean
  /** Prior review to prefill (server save file, or a baseline run's manualReview). */
  manual?: ManualReview | null
}

/**
 * Renders the self-contained review page: report data, prior review, styles, and
 * client logic all inlined — works from file:// (localStorage + export) and when
 * served by the review server (autosave + screenshots + merge).
 */
export const renderReviewHtml = (report: Report, options: RenderReviewOptions): string => {
  const css = readFileSync(join(HERE, 'client.css'), 'utf8')
  const js = readFileSync(join(HERE, 'client.js'), 'utf8')
  const payload = embedJson({ report, manual: options.manual ?? null, served: options.served })

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility manual review — WCAG 2.2 AA</title>
<style>
${css}
</style>
</head>
<body>
<header class="app" id="app-header"></header>
<div id="toolbar"><div class="inner" id="toolbar-inner"></div></div>
<main>
  <!-- data-a11y-eval-ignore: these sections quote arbitrary evaluated-page content and
       review procedures; excluding them from text-level checks (sensory phrases,
       language detection) prevents the tool flagging its own quotations. -->
  <section id="summary" aria-label="Automated results" data-a11y-eval-ignore></section>
  <section id="plan" aria-label="Recommended fixes" data-a11y-eval-ignore></section>
  <section id="checklist" aria-label="Manual review checklist" data-a11y-eval-ignore></section>
</main>
<footer class="app" id="app-footer"></footer>
<script type="application/json" id="a11y-data">${payload}</script>
<script>
${js}
</script>
</body>
</html>
`
}
