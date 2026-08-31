import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eslintReportToFindings } from '../engines/staticMerge.ts'
import type { Finding } from '../types.ts'
import type { RepoInfo } from './detect.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FALLBACK_CONFIG = join(HERE, 'fallback-eslint.config.mjs')
const BUNDLED_ESLINT = join(HERE, '..', '..', 'node_modules', '.bin', 'eslint')

export type StaticScanMode = 'repo-eslint' | 'bundled-jsx-a11y' | 'skipped'

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

/**
 * Static accessibility scan of the repo's source.
 * Prefers the repo's own ESLint setup (its config knows the framework); falls back
 * to the bundled jsx-a11y flat config when none exists or it fails to run.
 * ESLint exits 1 when it finds lint errors — that is a successful scan.
 */
export const runStaticScan = (repoDir: string, info: RepoInfo): StaticScanResult => {
  if (info.hasEslintConfig) {
    const result = runEslint('npx', ['--no-install', 'eslint', '.', '--format', 'json'], repoDir)
    if ((result.status === 0 || result.status === 1) && result.stdout) {
      const findings = parseFindings(result.stdout)
      if (findings !== null) return { findings, mode: 'repo-eslint' }
    }
  }

  const result = runEslint(
    BUNDLED_ESLINT,
    ['--config', FALLBACK_CONFIG, '--no-error-on-unmatched-pattern', '--format', 'json', ...info.sourceDirs],
    repoDir,
  )
  if ((result.status === 0 || result.status === 1) && result.stdout) {
    const findings = parseFindings(result.stdout)
    if (findings !== null) {
      return {
        findings,
        mode: 'bundled-jsx-a11y',
        note: info.hasEslintConfig ? "Repo's own ESLint failed to run; used bundled jsx-a11y config instead." : undefined,
      }
    }
  }

  return {
    findings: [],
    mode: 'skipped',
    note: `Static scan could not run: ${(result.stderr || 'unknown error').slice(0, 300)}`,
  }
}
