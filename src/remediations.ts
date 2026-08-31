import type { Finding, Impact, Remediation, RemediationGroup } from './types.ts'

/**
 * Deterministic remediation catalog: ruleId → how to actually fix it, including
 * the pitfalls (anti-fixes that make things worse). Rules not in the catalog fall
 * back to a generic entry pointing at the finding's helpUrl.
 */
const CATALOG: Record<string, Remediation> = {
  // ---- custom keyboard engine rules ----
  'keyboard-unreachable': {
    summary: 'Replace the click-only element with a native interactive element.',
    steps: [
      'Use <button type="button"> for actions and <a href> for navigation instead of div/span with onclick.',
      'Move the click handler onto the native element; styling carries over via the same class.',
      'Re-test: the element must be reachable with Tab and activate with Enter (and Space for buttons).',
    ],
    example: {
      bad: '<div class="btn" onclick="save()">Save</div>',
      good: '<button type="button" class="btn" onclick="save()">Save</button>',
    },
    effort: 'small',
    pitfalls: [
      'Do not just add tabindex="0" and a keydown handler to the div — you would be re-implementing button semantics AT already gets for free (role, name, Space/Enter, form participation).',
      'Do not hide the element from assistive technology to silence the finding.',
    ],
  },
  'focus-not-visible': {
    summary: 'Restore a visible focus indicator; never remove an outline without a replacement.',
    steps: [
      'Delete blanket outline removals (e.g. * { outline: none }).',
      'Add a global :focus-visible style: outline ≥2px, offset, with ≥3:1 contrast against adjacent colors.',
    ],
    example: {
      bad: '* { outline: none; }',
      good: ':focus-visible { outline: 3px solid var(--focus-color); outline-offset: 2px; }',
    },
    effort: 'trivial',
    pitfalls: ['A background-color change alone is a weak indicator — pair it with an outline or visible ring.'],
  },
  'horizontal-overflow-320': {
    summary: 'Make the layout reflow to a single column at narrow widths.',
    steps: [
      'Find the overflowing element (DevTools: iterate elements wider than document.documentElement.clientWidth at 320px).',
      'Replace fixed widths with max-width: 100%; use flex-wrap/grid auto-fit; give tables/code blocks their own overflow-x: auto container.',
    ],
    effort: 'medium',
    pitfalls: [
      'Data tables, maps, and diagrams are exempt from Reflow — wrap them in a scrollable container instead of breaking them.',
      'Do not "fix" with a smaller root font-size; text must stay resizable.',
    ],
  },
  // ---- high-frequency axe rules ----
  'image-alt': {
    summary: 'Give every informative image a meaningful alt; mark decorative ones empty.',
    steps: [
      'Informative image: alt describes the information ("Q3 revenue up 12% to €4.2M"), not the medium ("chart").',
      'Decorative image: alt="" (never omit the attribute).',
      'Functional image (inside a link/button): alt states the action/destination.',
    ],
    example: { bad: '<img src="chart.png">', good: '<img src="chart.png" alt="Q3 revenue rose 12% to €4.2M">' },
    effort: 'small',
    pitfalls: ['alt="" on an informative image passes the scanner and fails the user — the fix is content, not attributes.'],
  },
  'color-contrast': {
    summary: 'Adjust the color pair to meet ≥4.5:1 (normal text) / ≥3:1 (large text).',
    steps: [
      'Fix at the design-token level when many findings share a palette color — one token change clears the whole group.',
      'Verify the new pair with a contrast checker; do not adjust by eye.',
    ],
    effort: 'small',
    pitfalls: [
      'Placeholder and disabled-looking text used for real content still needs contrast.',
      'Text over images/gradients must meet contrast at its worst point — add a scrim if needed.',
    ],
  },
  label: {
    summary: 'Associate a visible <label> with every form control.',
    steps: [
      'Add <label for="id"> pointing at the input (or wrap the input in the label).',
      'Keep the label visible — placeholder text is not a label.',
    ],
    example: {
      bad: '<input placeholder="Email">',
      good: '<label for="email">Email</label>\n<input id="email" type="email" autocomplete="email">',
    },
    effort: 'small',
    pitfalls: ['aria-label works for AT but leaves sighted users without a persistent label — prefer a visible one.'],
  },
  'select-name': {
    summary: 'Give the select an accessible name via a visible associated label.',
    steps: ['Add <label for> for the select; if space truly forbids it, use aria-label as a last resort.'],
    effort: 'trivial',
    pitfalls: ['A heading or nearby text is not programmatically associated — use label/for.'],
  },
  'button-name': {
    summary: 'Give the button a text name (visible text or aria-label for icon-only buttons).',
    steps: ['Prefer visible text; for icon-only buttons add aria-label="Action name" and keep the icon aria-hidden.'],
    effort: 'trivial',
    pitfalls: ['title alone is not reliably announced and never shown to touch users.'],
  },
  'link-name': {
    summary: 'Make link text describe the destination.',
    steps: ['Replace empty/icon-only links with text, or add aria-label; avoid bare "click here"/"read more".'],
    effort: 'trivial',
    pitfalls: ['Do not fix by adding the same generic aria-label to many different links.'],
  },
  'html-has-lang': {
    summary: 'Declare the page language on the root element.',
    steps: ['Add lang to <html> (e.g. <html lang="en">) matching the actual content language.'],
    effort: 'trivial',
    pitfalls: ['A wrong lang is worse than none — screen readers switch pronunciation voices based on it.'],
  },
  'document-title': {
    summary: 'Give the page a descriptive <title>.',
    steps: ['Add <title>Specific page — Product</title>; make it unique per page/route (SPAs: update on navigation).'],
    effort: 'trivial',
    pitfalls: ['Identical titles on every route defeat tab identification and history.'],
  },
  'target-size': {
    summary: 'Enlarge or space out small interactive targets (≥24×24 CSS px).',
    steps: ['Increase padding/min-height, or add spacing so a 24px circle on each target touches no neighbor.'],
    effort: 'small',
    pitfalls: ['Inline links inside sentences are exempt — do not inflate prose links.'],
  },
  // ---- common jsx-a11y static rules ----
  'jsx-a11y/alt-text': {
    summary: 'Add alt text to the JSX image (see image-alt guidance).',
    steps: ['Informative: meaningful alt prop. Decorative: alt="".'],
    effort: 'trivial',
    pitfalls: ['Spreading props without alt keeps the violation — set it explicitly at the call site.'],
  },
  'jsx-a11y/click-events-have-key-events': {
    summary: 'Use a native button/link instead of a clickable non-interactive element.',
    steps: ['Replace the div/span with <button> or <a>; if truly impossible, add role, tabIndex={0}, and Enter/Space key handling.'],
    effort: 'small',
    pitfalls: ['Adding only onKeyDown without role and tabIndex still leaves the element unfocusable and unannounced.'],
  },
  'jsx-a11y/anchor-is-valid': {
    summary: 'Anchors navigate; buttons act. Give <a> a real href or make it a <button>.',
    steps: ['Navigation: <a href="/route">. Action: <button type="button" onClick=…>.'],
    effort: 'trivial',
    pitfalls: ['href="#" with preventDefault keeps broken semantics and pollutes history.'],
  },
  'jsx-a11y/no-autofocus': {
    summary: 'Remove autoFocus; move focus intentionally only in response to user action.',
    steps: ['Delete the autoFocus prop; if focus management is needed (dialog open), set it from the triggering event.'],
    effort: 'trivial',
    pitfalls: ['Auto-focusing on page load disorients screen-reader and low-vision users mid-announcement.'],
  },
}

const FALLBACK: Remediation = {
  summary: 'Follow the linked rule documentation for this finding.',
  steps: ['Open the finding’s helpUrl for the rule-specific fix.', 'Re-run the evaluation to confirm the fix.'],
  effort: 'small',
  pitfalls: ['Do not suppress the rule or hide the element from assistive technology to silence the finding.'],
}

export const remediationFor = (ruleId: string): Remediation => CATALOG[ruleId] ?? FALLBACK

const IMPACT_RANK: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }

/**
 * Groups findings by root cause (rule) and orders the plan by impact, then reach.
 * One systemic cause — a bad token, a repeated component — reads as one fix.
 */
export const buildRemediationPlan = (findings: Finding[]): RemediationGroup[] => {
  const groups = new Map<string, RemediationGroup>()
  for (const f of findings) {
    const key = `${f.engine}::${f.ruleId}`
    const existing = groups.get(key)
    if (existing) {
      existing.findingCount += 1
      if (!existing.pages.includes(f.page)) existing.pages.push(f.page)
      if (IMPACT_RANK[f.impact] < IMPACT_RANK[existing.impact]) existing.impact = f.impact
      for (const sc of f.wcag) if (!existing.wcag.includes(sc)) existing.wcag.push(sc)
    } else {
      groups.set(key, {
        ruleId: f.ruleId,
        engine: f.engine,
        impact: f.impact,
        findingCount: 1,
        pages: [f.page],
        wcag: [...f.wcag],
        recommendation: remediationFor(f.ruleId),
      })
    }
  }
  return [...groups.values()].sort(
    (a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.findingCount - a.findingCount,
  )
}
