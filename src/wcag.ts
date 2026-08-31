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
  { sc: '1.2.2', name: 'Captions (Prerecorded)', why: 'Caption presence and accuracy for media needs human judgment.' },
  { sc: '1.2.5', name: 'Audio Description (Prerecorded)', why: 'Whether visual information is conveyed in audio requires watching the content.' },
  { sc: '1.3.3', name: 'Sensory Characteristics', why: 'Instructions relying on shape/position/sound ("click the round button on the right") need semantic review.' },
  { sc: '1.4.1', name: 'Use of Color', why: 'Axe catches some cases; meaning conveyed only by color in charts, links, and states needs visual review.' },
  { sc: '1.4.13', name: 'Content on Hover or Focus', why: 'Dismissable/hoverable/persistent behavior of tooltips and popovers must be interactively tested.' },
  { sc: '2.1.2', name: 'No Keyboard Trap', why: 'The tab-walk check samples reachability; full trap detection needs interactive testing of every overlay.' },
  { sc: '2.4.3', name: 'Focus Order', why: 'Automation checks reachability, not whether the order preserves meaning and operability.' },
  { sc: '2.4.6', name: 'Headings and Labels', why: 'Whether headings/labels actually describe their content is a language judgment.' },
  { sc: '2.5.7', name: 'Dragging Movements', why: 'Single-pointer alternatives to drag interactions must be exercised by hand.' },
  { sc: '2.5.8', name: 'Target Size (Minimum)', why: 'Axe flags some cases; overlapping targets and spacing exceptions need visual confirmation.' },
  { sc: '3.1.2', name: 'Language of Parts', why: 'Foreign-language passages without lang attributes require content review.' },
  { sc: '3.2.1', name: 'On Focus', why: 'Unexpected context changes on focus must be observed interactively.' },
  { sc: '3.2.2', name: 'On Input', why: 'Unexpected context changes when changing a setting must be observed interactively.' },
  { sc: '3.3.2', name: 'Labels or Instructions', why: 'Label presence is automatable; label adequacy is not.' },
  { sc: '3.3.3', name: 'Error Suggestion', why: 'Whether error messages actually tell users how to fix the problem is a content judgment.' },
  { sc: '3.3.7', name: 'Redundant Entry', why: 'Detecting re-requested information across a process requires understanding the flow.' },
]

export const COVERAGE_NOTE =
  'Automated checks cover roughly 30-50% of WCAG 2.2 AA. A "pass" verdict means no automated violations were found — it is not a compliance claim. The manualChecklist criteria require human or agent review.'
