import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eslintReportToFindings } from '../engines/staticMerge.ts'
import type { Finding } from '../types.ts'
import type { RepoInfo } from './detect.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FALLBACK_CONFIG = join(HERE, 'fallback-eslint.config.mjs')
const BUNDLED_ESLINT = join(HERE, '..', '..', 'node_modules', '.bin', 'eslint')

export type StaticScanMode = 'bundled-a11y' | 'bundled+repo-eslint' | 'repo-eslint' | 'skipped'

export interface StaticScanResult {
  findings: Finding[]
  mode: StaticScanMode
  note?: string
}

const runEslint = (command: string, args: string[], cwd: string) =>
  spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const parseFindings = (stdout: string): Finding[] | null => {
  try {
    return eslintReportToFindings(JSON.parse(stdout))
  } catch {
    return null
  }
}

/** Same source location + rule from two scanners is one finding. */
export const dedupeStaticFindings = (findings: Finding[]): Finding[] => {
  const seen = new Set<string>()
  const result: Finding[] = []
  for (const f of findings) {
    const key = `${f.targets[0] ?? f.page}::${f.ruleId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(f)
  }
  return result
}

/**
 * Static accessibility scan of the repo's source, self-contained by design:
 * the BUNDLED a11y ESLint (a11y-eval's own eslint + jsx-a11y + vuejs-accessibility)
 * always runs and never depends on the target repo's lint setup. When the repo has
 * its own ESLint config, it runs too as an additional source — its config may know
 * framework-specific a11y rules ours doesn't — and the results are merged and
 * deduplicated. A repo config without a11y plugins therefore no longer masks the
 * scan with a silent zero-finding "success".
 */
export const runStaticScan = (repoDir: string, info: RepoInfo): StaticScanResult => {
  let bundledFindings: Finding[] | null = null
  let bundledNote: string | undefined
  const bundled = runEslint(
    BUNDLED_ESLINT,
    ['--config', FALLBACK_CONFIG, '--no-error-on-unmatched-pattern', '--format', 'json', ...info.sourceDirs],
    repoDir,
  )
  if ((bundled.status === 0 || bundled.status === 1) && bundled.stdout) {
    bundledFindings = parseFindings(bundled.stdout)
  }
  if (bundledFindings === null) {
    bundledNote = `Bundled a11y ESLint could not run: ${(bundled.stderr || 'unknown error').slice(0, 300)}`
  }

  let repoFindings: Finding[] | null = null
  let repoNote: string | undefined
  if (info.hasEslintConfig) {
    const repo = runEslint('npx', ['--no-install', 'eslint', '.', '--format', 'json'], repoDir)
    if ((repo.status === 0 || repo.status === 1) && repo.stdout) {
      repoFindings = parseFindings(repo.stdout)
    }
    if (repoFindings === null) {
      repoNote = "Repo's own ESLint failed to run (its config or install may be broken); bundled scan still covers a11y rules."
    }
  }

  const note = [bundledNote, repoNote].filter(Boolean).join(' ') || undefined

  if (bundledFindings !== null && repoFindings !== null) {
    return { findings: dedupeStaticFindings([...bundledFindings, ...repoFindings]), mode: 'bundled+repo-eslint', note }
  }
  if (bundledFindings !== null) {
    return { findings: bundledFindings, mode: 'bundled-a11y', note }
  }
  if (repoFindings !== null) {
    return { findings: repoFindings, mode: 'repo-eslint', note }
  }
  return { findings: [], mode: 'skipped', note: note ?? 'Static scan could not run.' }
}
