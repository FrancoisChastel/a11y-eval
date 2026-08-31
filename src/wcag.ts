import type { ManualCheckItem } from './types.ts'

/**
 * Axe encodes success criteria as tags like "wcag143" (1.4.3) or "wcag1410" (1.4.10).
 * Principle and guideline are always single digits, so the split is unambiguous.
 * Level tags (wcag2aa, wcag22aa), category tags (cat.*), and best-practice are skipped.
 */
export const tagsToCriteria = (tags: string[]): string[] => {
  const criteria: string[] = []
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag)
    if (!match) continue
    const sc = `${match[1]}.${match[2]}.${Number(match[3])}`
    if (!criteria.includes(sc)) criteria.push(sc)
  }
  return criteria
}

/**
 * WCAG 2.2 AA criteria that automated tooling cannot verify (or only partially).
 * These must be reviewed by a human or a reviewing agent for any compliance claim —
 * automated coverage is roughly 30–50% of WCAG. Never report "compliant" from
 * automation alone.
 */
export const MANUAL_CHECKLIST: ManualCheckItem[] = [
  { sc: '1.2.2', name: 'Captions (Prerecorded)', why: 'Caption presence and accuracy for media needs human judgment.', signal: 'media',
    how: 'Find every video/audio element and media embed. Prerecorded media without captions or a transcript fails. Caption accuracy needs watching the content.' },
  { sc: '1.2.5', name: 'Audio Description (Prerecorded)', why: 'Whether visual information is conveyed in audio requires watching the content.', signal: 'media',
    how: 'For each prerecorded video: does the audio track (or an audio-described version) convey the important visual information? Watch it.' },
  { sc: '1.3.3', name: 'Sensory Characteristics', why: 'Instructions relying on shape/position/sound ("click the round button on the right") need semantic review.', signal: null,
    how: 'Read all instructional text. Anything like "click the green button", "the box on the right", "when you hear the tone" fails unless the reference also works without that sense.' },
  { sc: '1.4.1', name: 'Use of Color', why: 'Axe catches some cases; meaning conveyed only by color in charts, links, and states needs visual review.', signal: null,
    how: 'Check links inside prose (distinguished by more than color?), status indicators, required-field markers, and charts. Every color-carried meaning needs a second cue: text, icon, underline, or pattern.' },
  { sc: '1.4.13', name: 'Content on Hover or Focus', why: 'Dismissable/hoverable/persistent behavior of tooltips and popovers must be interactively tested.', signal: 'hoverContent',
    how: 'For each tooltip/popover/dropdown that appears on hover or focus: can it be dismissed with Esc without moving the pointer? Can the pointer move onto the revealed content? Does it stay until dismissed?' },
  { sc: '2.1.2', name: 'No Keyboard Trap', why: 'The tab-walk check samples reachability; full trap detection needs interactive testing of every overlay.', signal: null,
    how: 'Open every modal, drawer, menu, and embedded widget with the keyboard. Confirm Tab cycles inside sensibly and Esc or a reachable control always exits. Try to get stuck.' },
  { sc: '2.4.3', name: 'Focus Order', why: 'Automation checks reachability, not whether the order preserves meaning and operability.', signal: null,
    how: 'Tab through each page start to finish. Focus must follow the visual/logical reading order — no jumps to the footer mid-form, no landing in hidden content.' },
  { sc: '2.4.6', name: 'Headings and Labels', why: 'Whether headings/labels actually describe their content is a language judgment.', signal: null,
    how: 'Read every heading and label out of context: does it describe its section or input? Generic ("Section 1") or wrong ones fail.' },
  { sc: '2.5.7', name: 'Dragging Movements', why: 'Single-pointer alternatives to drag interactions must be exercised by hand.', signal: 'drag',
    how: 'For each drag interaction (sliders, sortable lists, kanban, drawing): is there a click/tap or keyboard alternative achieving the same result? Exercise it.' },
  { sc: '2.5.8', name: 'Target Size (Minimum)', why: 'Axe flags some cases; overlapping targets and spacing exceptions need visual confirmation.', signal: null,
    how: 'Measure small targets in dense areas (toolbars, icon rows, stacked links): each needs ≥24×24 CSS px, OR enough spacing that a 24px circle centered on it touches no other target, OR an equivalent larger control, OR to be inline in a sentence.' },
  { sc: '3.1.2', name: 'Language of Parts', why: 'Foreign-language passages without lang attributes require content review.', signal: null,
    how: 'Find passages in a different language than the page lang attribute. Each needs its own lang attribute so screen readers switch voice.' },
  { sc: '3.2.1', name: 'On Focus', why: 'Unexpected context changes on focus must be observed interactively.', signal: null,
    how: 'Tab onto (do not activate) every focusable element. Merely receiving focus must never open modals, move focus elsewhere, or navigate.' },
  { sc: '3.2.2', name: 'On Input', why: 'Unexpected context changes when changing a setting must be observed interactively.', signal: 'forms',
    how: 'Change every select, radio, and checkbox. Changing a value must not auto-submit, navigate, or move focus unless the user was told beforehand.' },
  { sc: '3.3.2', name: 'Labels or Instructions', why: 'Label presence is automatable; label adequacy is not.', signal: 'forms',
    how: 'Automation checked label presence; you check meaning. Placeholder-only labels, ambiguous ones ("Date" — of what? which format?), and icon-only buttons with no accessible name fail.' },
  { sc: '3.3.3', name: 'Error Suggestion', why: 'Whether error messages actually tell users how to fix the problem is a content judgment.', signal: 'forms',
    how: 'Submit each form with invalid input. Every message must say how to fix the problem ("Enter a date after the start date"), not just that it is wrong.' },
  { sc: '3.3.7', name: 'Redundant Entry', why: 'Detecting re-requested information across a process requires understanding the flow.', signal: 'forms',
    how: 'Walk multi-step flows. Information already provided must be auto-filled or selectable, not typed again (unless re-entry is essential, e.g. password confirmation).' },
]

export const COVERAGE_NOTE =
  'Automated checks cover roughly 30-50% of WCAG 2.2 AA. A "pass" verdict means no automated violations were found — it is not a compliance claim. The manualChecklist criteria require human or agent review.'
