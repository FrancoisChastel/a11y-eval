'use strict'
/* a11y-eval manual review client. No framework, no build step.
   All report-derived content is inserted via textContent — never innerHTML —
   because evaluated pages are untrusted input. */

const data = JSON.parse(document.getElementById('a11y-data').textContent)
const report = data.report
const served = data.served === true

const STATUSES = [
  ['pass', 'Pass'],
  ['fail', 'Fail'],
  ['needs-expert', 'Needs expert'],
  ['not-applicable', 'Not applicable'],
]
const METHODS = ['keyboard', 'screen-reader', 'visual', 'code-read', 'signal-based']
const SEVERITIES = ['critical', 'serious', 'moderate', 'minor']
const SIGNAL_LABELS = {
  media: 'media elements (video/audio/embeds)',
  forms: 'form controls',
  drag: 'drag affordances (draggable/sliders)',
  hoverContent: 'hover/focus-revealed content',
  langParts: 'foreign-language parts',
  iframes: 'iframes',
}

// ---------- tiny DOM builder (text-safe) ----------
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'text') node.textContent = String(value)
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (value === true) node.setAttribute(key, '')
    else node.setAttribute(key, String(value))
  }
  for (const child of children) if (child) node.append(child)
  return node
}

// ---------- state ----------
const hash = (input) => {
  let h = 5381
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  return h.toString(36)
}
const storageKey = `a11y-review-${hash(report.startedAt + report.pages.map((p) => p.url).join('|'))}`

const emptyState = () => ({
  reviewer: {},
  environment: {},
  startedAt: new Date().toISOString(),
  items: {},
})

const fromManualReview = (manual) => {
  const state = emptyState()
  if (!manual || !Array.isArray(manual.items)) return null
  state.reviewer = manual.reviewer || {}
  state.environment = manual.environment || {}
  state.startedAt = manual.startedAt || state.startedAt
  for (const item of manual.items) state.items[item.sc] = { ...item }
  return state
}

let state =
  fromManualReview(data.manual) ||
  (() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : emptyState()
    } catch {
      return emptyState()
    }
  })()

const buildManualReview = () => ({
  reviewer: state.reviewer,
  environment: state.environment,
  startedAt: state.startedAt,
  finishedAt: new Date().toISOString(),
  items: report.manualChecklist.filter((c) => state.items[c.sc]?.status).map((c) => ({ sc: c.sc, ...state.items[c.sc] })),
})

let saveTimer
const announce = (message) => {
  document.getElementById('save-status').textContent = message
}
const save = () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    /* storage full/blocked — export still works */
  }
  updateProgress()
  if (!served) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/manual-review', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildManualReview()) })
      announce('Saved to server.')
    } catch {
      announce('Server save failed — progress kept in this browser.')
    }
  }, 700)
}

const item = (sc) => (state.items[sc] ??= {})

// ---------- signals ----------
const signalTotals = {}
for (const page of report.pages) {
  for (const [key, value] of Object.entries(page.signals || {})) signalTotals[key] = (signalTotals[key] || 0) + value
}
const pagesWithSignal = (key) => report.pages.filter((p) => (p.signals || {})[key] > 0).map((p) => p.url)

// ---------- header ----------
const textField = (id, labelText, get, set, hint) => {
  const input = el('input', { type: 'text', id, value: get() || '', oninput: (e) => { set(e.target.value); save() } })
  return el('div', { class: 'field' },
    el('label', { for: id }, el('span', { text: labelText }), hint ? el('span', { class: 'hint', text: ` ${hint}` }) : null),
    input)
}

const renderHeader = () => {
  const target = report.meta?.repo || report.pages.map((p) => p.url).join(', ')
  document.getElementById('app-header').append(
    el('h1', { text: 'Accessibility manual review — WCAG 2.2 AA' }),
    el('p', { text: `Target: ${target}` }),
    el('p', { text: `Automated run: ${report.startedAt} · mode: ${served ? 'served (autosaves to disk)' : 'static (saves in this browser; use Export when done)'}` }),
    el('div', { class: 'inline-fields' },
      textField('reviewer-name', 'Reviewer name', () => state.reviewer.name, (v) => (state.reviewer.name = v), '(optional)'),
      textField('env-browser', 'Browser', () => state.environment.browser, (v) => (state.environment.browser = v), '(optional)'),
      textField('env-os', 'Operating system', () => state.environment.os, (v) => (state.environment.os = v), '(optional)'),
      textField('env-at', 'Assistive tech used', () => state.environment.assistiveTech, (v) => (state.environment.assistiveTech = v), '(optional, e.g. VoiceOver)')),
  )
}

// ---------- automated summary ----------
const renderSummary = () => {
  const main = document.getElementById('summary')
  main.append(el('h2', { text: 'Automated results' }))
  main.append(el('p', { class: 'verdict-line' },
    el('span', { text: 'Verdict: ' }), el('strong', { text: report.verdict }),
    el('span', { text: ` · score ${report.score}/100 · critical ${report.totals.critical}, serious ${report.totals.serious}, moderate ${report.totals.moderate}, minor ${report.totals.minor} · ${report.pages.length} page(s)` })))
  if (report.baselineDiff) {
    const d = report.baselineDiff
    main.append(el('p', { text: `Versus baseline: ${d.newCount} new, ${d.persistingCount} persisting, ${d.fixedCount} fixed.` }))
  }
  main.append(el('p', { text: report.coverageNote }))

  for (const page of report.pages) {
    const pageScore = page.score === undefined ? '' : ` — score ${page.score}/100`
    main.append(el('h3', { text: `${page.url}${pageScore} — ${page.findings.length} finding(s), ${page.incomplete} axe-incomplete` }))
    if (page.findings.length === 0) continue
    const rows = page.findings.map((f) =>
      el('tr', {},
        el('td', {}, el('span', { class: `badge ${f.impact}`, text: f.confidence === 'suspect' ? `${f.impact} suspect` : f.impact }), f.baselineStatus ? el('span', { text: ` ${f.baselineStatus}` }) : null),
        el('td', { text: `${f.ruleId} (${f.wcag.join(', ') || 'best practice'})` }),
        el('td', {}, el('code', { text: f.targets[0] || '' })),
        el('td', {}, el('span', { text: f.description + ' ' }), f.helpUrl ? el('a', { href: f.helpUrl, text: 'Rule docs' }) : null)))
    main.append(el('div', { class: 'table-wrap' },
      el('table', {}, el('caption', { text: `Findings on ${page.url}` }),
        el('thead', {}, el('tr', {}, el('th', { text: 'Impact' }), el('th', { text: 'Rule' }), el('th', { text: 'Target' }), el('th', { text: 'Description' }))),
        el('tbody', {}, ...rows))))
  }
}

// ---------- remediation plan ----------
const renderPlan = () => {
  const main = document.getElementById('plan')
  if (!report.remediationPlan || report.remediationPlan.length === 0) return
  main.append(el('h2', { text: 'Recommended fixes (grouped by root cause, in order)' }))
  const list = el('ol', {})
  for (const group of report.remediationPlan) {
    const r = group.recommendation
    list.append(el('li', {},
      el('p', {},
        el('span', { class: `badge ${group.impact}`, text: group.impact }),
        el('strong', { text: ` ${group.ruleId}` }),
        el('span', { text: ` — ${group.findingCount} finding(s) on ${group.pages.length} page(s) · effort: ${r.effort}` })),
      el('p', { text: r.summary }),
      el('details', {},
        el('summary', { text: 'Steps and pitfalls' }),
        el('ul', {}, ...r.steps.map((s) => el('li', { text: s }))),
        el('p', { text: 'Pitfalls:' }),
        el('ul', {}, ...r.pitfalls.map((p) => el('li', { text: p }))))))
  }
  main.append(list)
}

// ---------- manual checklist ----------
const criterionWarning = new Map()
const updateWarning = (criterion) => {
  const warning = criterionWarning.get(criterion.sc)
  const current = item(criterion.sc)
  const contradicts =
    criterion.signal !== null && (signalTotals[criterion.signal] || 0) > 0 && current.status === 'not-applicable' && !current.evidence?.trim()
  warning.textContent = contradicts
    ? `Detected ${signalTotals[criterion.signal]} ${SIGNAL_LABELS[criterion.signal]} on the evaluated pages — "Not applicable" contradicts the signals. Add evidence explaining why, or review the criterion.`
    : ''
  warning.style.display = contradicts ? '' : 'none'
}

const updateProgress = () => {
  const total = report.manualChecklist.length
  const done = report.manualChecklist.filter((c) => state.items[c.sc]?.status).length
  document.getElementById('progress').textContent = `${done} of ${total} criteria dispositioned.`
  const count = document.getElementById('progress-count')
  if (count) count.textContent = `${done} / ${total}`
  const bar = document.getElementById('progress-bar')
  if (bar) bar.setAttribute('aria-valuenow', String(done))
  const fill = document.getElementById('progress-fill')
  if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`
  updateFilterCounts()
}

const suspectsFor = (sc) => report.findings.filter((f) => f.confidence === 'suspect' && f.wcag.includes(sc))
const packetsFor = (sc) => (report.evidence || []).filter((p) => p.sc === sc)
const hasFlag = (sc) =>
  suspectsFor(sc).length > 0 || packetsFor(sc).some((p) => p.items.some((i) => (i.text || '').startsWith('CONCERN')))

// ---------- toolbar: progress, filters, jump ----------
const STATUS_LABELS = { pass: 'Pass', fail: 'Fail', 'needs-expert': 'Needs expert', 'not-applicable': 'N/A' }
const criterionEls = new Map()
let activeFilter = 'all'

const matchesFilter = (criterion) => {
  const status = state.items[criterion.sc]?.status
  if (activeFilter === 'unreviewed') return !status
  if (activeFilter === 'flagged') return hasFlag(criterion.sc)
  if (activeFilter === 'failed') return status === 'fail'
  return true
}

const applyFilter = () => {
  for (const criterion of report.manualChecklist) {
    const els = criterionEls.get(criterion.sc)
    if (els) els.fieldset.style.display = matchesFilter(criterion) ? '' : 'none'
  }
  for (const chip of document.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.filter === activeFilter))
  }
  updateFilterCounts()
}

const filterCount = (filter) => {
  const prev = activeFilter
  activeFilter = filter
  const n = report.manualChecklist.filter(matchesFilter).length
  activeFilter = prev
  return n
}

const updateFilterCounts = () => {
  for (const chip of document.querySelectorAll('.chip .count')) {
    chip.textContent = ` ${filterCount(chip.parentElement.dataset.filter)}`
  }
}

const updateStatusPill = (criterion) => {
  const els = criterionEls.get(criterion.sc)
  if (!els) return
  const status = state.items[criterion.sc]?.status
  els.pill.textContent = status ? STATUS_LABELS[status] : 'Unreviewed'
  if (status) els.pill.dataset.status = status
  else delete els.pill.dataset.status
}

const setCollapsed = (sc, collapsed) => {
  const els = criterionEls.get(sc)
  if (!els) return
  els.fieldset.classList.toggle('collapsed', collapsed)
  els.toggle.setAttribute('aria-expanded', String(!collapsed))
  els.toggle.textContent = collapsed ? 'Expand' : 'Collapse'
}

const jumpToNext = () => {
  const next = report.manualChecklist.find((c) => !state.items[c.sc]?.status)
  if (!next) {
    announce('All criteria are dispositioned.')
    return
  }
  activeFilter = 'all'
  applyFilter()
  setCollapsed(next.sc, false)
  const els = criterionEls.get(next.sc)
  els.fieldset.scrollIntoView({ behavior: 'smooth', block: 'start' })
  els.fieldset.querySelector('input[type="radio"]')?.focus({ preventScroll: true })
}

const renderToolbar = () => {
  const inner = document.getElementById('toolbar-inner')
  inner.append(
    el('div', { class: 'progress-wrap' },
      el('div', { class: 'progress-label' },
        el('span', { text: 'Review progress' }),
        el('span', { id: 'progress-count', text: '' })),
      el('div', { class: 'progress-track', role: 'progressbar', 'aria-label': 'Criteria dispositioned', 'aria-valuemin': '0', 'aria-valuemax': String(report.manualChecklist.length), 'aria-valuenow': '0', id: 'progress-bar' },
        el('div', { class: 'progress-fill', id: 'progress-fill' }))),
    el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter criteria' },
      ...[['all', 'All'], ['unreviewed', 'Unreviewed'], ['flagged', 'Flagged'], ['failed', 'Failed']].map(([key, label]) =>
        el('button', { type: 'button', class: 'chip', 'data-filter': key, 'aria-pressed': String(key === activeFilter), onclick: () => { activeFilter = key; applyFilter() } },
          el('span', { text: label }), el('span', { class: 'count', 'aria-hidden': 'true' })))),
    el('button', { type: 'button', class: 'jump', text: 'Next unreviewed', onclick: jumpToNext }),
  )
}

const renderCriterion = (criterion) => {
  const current = item(criterion.sc)
  const idBase = `sc-${criterion.sc.replaceAll('.', '-')}`

  const pill = el('span', { class: 'status-pill', text: 'Unreviewed' })
  const body = el('div', { class: 'crit-body', id: `${idBase}-body` })
  const toggle = el('button', {
    type: 'button',
    class: 'collapse-toggle',
    'aria-expanded': 'true',
    'aria-controls': `${idBase}-body`,
    text: 'Collapse',
    onclick: () => setCollapsed(criterion.sc, !fieldset.classList.contains('collapsed')),
  })
  const fieldset = el('fieldset', { class: 'criterion', 'data-sc': criterion.sc },
    el('legend', {}, el('span', { text: `${criterion.sc} ${criterion.name}` }), pill, toggle))
  criterionEls.set(criterion.sc, { fieldset, pill, body, toggle })
  body.append(
    el('p', { class: 'signal-note', text: criterion.why }),
    el('details', {}, el('summary', { text: 'How to review' }), el('p', { text: criterion.how })))

  // Machine suspects: confirm or dismiss instead of hunting from scratch.
  const suspects = suspectsFor(criterion.sc)
  if (suspects.length > 0) {
    const list = el('ul', {}, ...suspects.map((s) =>
      el('li', {},
        el('span', { text: `${s.description} ` }),
        el('code', { text: s.targets[0] || '' }),
        el('span', { text: ` on ${s.page}` }),
        ...(s.evidence || []).map((shot) => el('span', {}, el('br'), el('img', { src: shot, alt: `Screenshot of suspect ${s.ruleId} at ${s.targets[0] || ''}`, style: 'max-width:220px;height:auto;border:1px solid var(--border-soft);border-radius:4px;margin-top:0.25rem' }))))))
    body.append(el('div', { class: 'warning', role: 'note' },
      el('p', {}, el('strong', { text: `${suspects.length} machine-flagged suspect(s) — confirm as Fail or dismiss with evidence:` })),
      list))
  }

  // Collected evidence packets (headings, labels, tab order…) for judgment criteria.
  for (const packet of packetsFor(criterion.sc)) {
    if (packet.items.length === 0) continue
    body.append(el('details', {},
      el('summary', { text: `Collected evidence: ${packet.kind} (${packet.items.length})` }),
      el('ul', {}, ...packet.items.slice(0, 40).map((entry) =>
        el('li', {}, el('code', { text: entry.selector || '' }), el('span', { text: ` ${entry.text || ''} — ${entry.page}` }))))))
  }

  // Signal context and auto-N/A suggestion
  if (criterion.signal !== null) {
    const total = signalTotals[criterion.signal] || 0
    if (total > 0) {
      body.append(el('p', { class: 'signal-note', text: `Signals: ${total} ${SIGNAL_LABELS[criterion.signal]} detected on: ${pagesWithSignal(criterion.signal).join(', ')} — this criterion must be reviewed.` }))
    } else if (!current.status) {
      const evidenceText = `No ${SIGNAL_LABELS[criterion.signal]} detected across ${report.pages.length} evaluated page(s) (content signals).`
      body.append(el('div', { class: 'suggestion' },
        el('p', { text: `${evidenceText} Suggested: Not applicable.` }),
        el('button', { type: 'button', class: 'small', text: 'Apply suggested N/A', onclick: (e) => {
          Object.assign(current, { status: 'not-applicable', evidence: evidenceText, autoSuggested: true, method: 'signal-based' })
          fieldset.querySelector(`input[name="${idBase}-status"][value="not-applicable"]`).checked = true
          fieldset.querySelector(`#${idBase}-evidence`).value = evidenceText
          e.target.closest('.suggestion').remove()
          updateWarning(criterion)
          updateStatusPill(criterion)
          setCollapsed(criterion.sc, true)
          applyFilter()
          save()
        } })))
    }
  }

  // Status radios
  const statusGroup = el('div', { class: 'status-group', role: 'radiogroup', 'aria-label': `Status for ${criterion.sc} ${criterion.name}` })
  for (const [value, label] of STATUSES) {
    statusGroup.append(el('label', {},
      el('input', { type: 'radio', name: `${idBase}-status`, value, checked: current.status === value, onchange: () => {
        current.status = value
        current.autoSuggested = false
        updateWarning(criterion)
        updateStatusPill(criterion)
        setCollapsed(criterion.sc, true)
        applyFilter()
        save()
      } }),
      el('span', { text: label })))
  }
  body.append(statusGroup)

  const warning = el('p', { class: 'warning', role: 'alert', style: 'display:none' })
  criterionWarning.set(criterion.sc, warning)
  body.append(warning)

  // Evidence
  body.append(el('div', { class: 'field' },
    el('label', { for: `${idBase}-evidence` }, el('span', { text: 'Evidence' }), el('span', { class: 'hint', text: ' (optional but strongly encouraged: what you inspected and observed — undocumented statuses are flagged in the final report)' })),
    el('textarea', { id: `${idBase}-evidence`, oninput: (e) => {
      current.evidence = e.target.value
      current.autoSuggested = false
      e.target.style.height = 'auto'
      e.target.style.height = `${e.target.scrollHeight + 2}px`
      updateWarning(criterion)
      save()
    } }, document.createTextNode(current.evidence || ''))))

  // Affected pages
  const pagesGroup = el('div', { class: 'pages-group' })
  for (const [index, page] of report.pages.entries()) {
    pagesGroup.append(el('label', {},
      el('input', { type: 'checkbox', value: page.url, checked: current.pages?.includes(page.url), onchange: (e) => {
        const set = new Set(current.pages || [])
        e.target.checked ? set.add(page.url) : set.delete(page.url)
        current.pages = [...set]
        save()
      }, 'aria-describedby': index === 0 ? `${idBase}-pages-hint` : undefined }),
      el('span', { text: page.url })))
  }
  body.append(el('div', { class: 'field' },
    el('span', { class: 'hint', id: `${idBase}-pages-hint`, text: 'Affected pages (leave unchecked if the disposition applies app-wide):' }),
    pagesGroup))

  // Severity + method
  const severitySelect = el('select', { id: `${idBase}-severity`, onchange: (e) => { current.severity = e.target.value || undefined; save() } },
    el('option', { value: '', text: 'serious (default)' }),
    ...SEVERITIES.map((s) => el('option', { value: s, text: s, selected: current.severity === s })))
  const methodSelect = el('select', { id: `${idBase}-method`, onchange: (e) => { current.method = e.target.value || undefined; save() } },
    el('option', { value: '', text: 'not specified' }),
    ...METHODS.map((m) => el('option', { value: m, text: m, selected: current.method === m })))
  body.append(el('div', { class: 'inline-fields' },
    el('div', { class: 'field' }, el('label', { for: `${idBase}-severity`, text: 'Severity if failed' }), severitySelect),
    el('div', { class: 'field' }, el('label', { for: `${idBase}-method`, text: 'Review method' }), methodSelect)))

  // Evidence screenshots (served mode only)
  if (served) {
    const shotList = el('ul', { class: 'shot-list' }, ...(current.screenshots || []).map((s) => el('li', {}, el('a', { href: `/${s}` }, el('img', { src: `/${s}`, alt: `Evidence screenshot for ${criterion.sc}: ${s}` })))))
    const pageSelect = el('select', { id: `${idBase}-shot-page`, 'aria-label': `Page to screenshot for ${criterion.sc}` },
      ...report.pages.map((p) => el('option', { value: p.url, text: p.url })))
    const selectorInput = el('input', { type: 'text', id: `${idBase}-shot-selector`, 'aria-label': `CSS selector to screenshot for ${criterion.sc} (optional)`, placeholder: 'CSS selector (optional)' })
    fieldset.append(el('div', { class: 'field' },
      el('label', { for: `${idBase}-shot-page`, text: 'Capture evidence screenshot' }),
      el('div', { class: 'inline-fields' }, pageSelect, selectorInput,
        el('button', { type: 'button', class: 'small secondary', text: 'Capture', onclick: async (e) => {
          e.target.disabled = true
          announce('Capturing screenshot…')
          try {
            const res = await fetch('/api/screenshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: pageSelect.value, selector: selectorInput.value || undefined }) })
            if (!res.ok) throw new Error(await res.text())
            const { path } = await res.json()
            ;(current.screenshots ??= []).push(path)
            shotList.append(el('li', {}, el('a', { href: `/${path}` }, el('img', { src: `/${path}`, alt: `Evidence screenshot for ${criterion.sc}: ${path}` }))))
            announce('Screenshot captured.')
            save()
          } catch (err) {
            announce(`Screenshot failed: ${err.message}`)
          } finally {
            e.target.disabled = false
          }
        } })),
      shotList))
  }

  fieldset.append(body)
  updateWarning(criterion)
  updateStatusPill(criterion)
  if (current.status) setCollapsed(criterion.sc, true)
  return fieldset
}

const renderChecklist = () => {
  const main = document.getElementById('checklist')
  main.append(
    el('h2', { text: 'Manual review — criteria automation cannot verify' }),
    el('p', { text: 'Disposition every criterion. Statuses without evidence are allowed but will be listed as undocumented in the final report.' }))
  for (const criterion of report.manualChecklist) main.append(renderCriterion(criterion))
}

// ---------- footer ----------
const download = (name, content) => {
  const a = el('a', { href: URL.createObjectURL(new Blob([content], { type: 'application/json' })), download: name })
  document.body.append(a)
  a.click()
  a.remove()
}

const renderFooter = () => {
  const footer = document.getElementById('app-footer')
  footer.append(
    el('p', { role: 'status', id: 'progress' }),
    el('p', { role: 'status', id: 'save-status' }),
    el('button', { type: 'button', class: 'secondary', text: 'Export manual-review.json', onclick: () => download('manual-review.json', JSON.stringify(buildManualReview(), null, 2)) }),
    el('label', { class: 'field' },
      el('span', { text: 'Import a manual-review.json ' }),
      el('input', { type: 'file', accept: 'application/json', onchange: async (e) => {
        const file = e.target.files[0]
        if (!file) return
        try {
          const imported = fromManualReview(JSON.parse(await file.text()))
          if (!imported) throw new Error('not a manual review file')
          state = imported
          save()
          location.reload()
        } catch (err) {
          announce(`Import failed: ${err.message}`)
        }
      } })))
  if (served) {
    footer.append(el('button', { type: 'button', text: 'Finalize: merge into final report', onclick: async (e) => {
      e.target.disabled = true
      announce('Merging…')
      try {
        const res = await fetch('/api/merge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildManualReview()) })
        if (!res.ok) throw new Error(await res.text())
        const merged = await res.json()
        announce(`Merged. Overall: ${merged.overall}, score ${merged.score}. Written to ${merged.out}.`)
      } catch (err) {
        announce(`Merge failed: ${err.message}`)
      } finally {
        e.target.disabled = false
      }
    } }))
  }
  updateProgress()
}

renderHeader()
renderToolbar()
renderSummary()
renderPlan()
renderChecklist()
renderFooter()
applyFilter()
