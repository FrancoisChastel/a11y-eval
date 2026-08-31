import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from 'playwright'
import type { Finding, Impact } from '../types.ts'
import { tagsToCriteria } from '../wcag.ts'

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

const asImpact = (impact: string | null | undefined): Impact => {
  if (impact === 'critical' || impact === 'serious' || impact === 'moderate' || impact === 'minor') return impact
  return 'moderate'
}

export interface AxeRunResult {
  findings: Finding[]
  passes: number
  incomplete: number
}

/** Runs axe-core (WCAG 2.x A + AA rulesets) against the current page. */
export const runAxe = async (page: Page, url: string): Promise<AxeRunResult> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

  const findings: Finding[] = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      engine: 'axe' as const,
      ruleId: violation.id,
      impact: asImpact(node.impact ?? violation.impact),
      wcag: tagsToCriteria(violation.tags),
      description: violation.help,
      helpUrl: violation.helpUrl,
      page: url,
      targets: node.target.map(String),
      html: node.html,
    })),
  )

  return { findings, passes: results.passes.length, incomplete: results.incomplete.length }
}
