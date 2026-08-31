import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Framework = 'next' | 'angular' | 'svelte' | 'vue' | 'cra' | 'vite' | 'unknown'
export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm'

export interface RepoInfo {
  framework: Framework
  packageManager: PackageManager
  startCommand?: string
  defaultPort?: number
  hasEslintConfig: boolean
  sourceDirs: string[]
}

const FRAMEWORK_PORTS: Record<Framework, number | undefined> = {
  next: 3000,
  angular: 4200,
  svelte: 5173,
  vue: 5173,
  cra: 3000,
  vite: 5173,
  unknown: undefined,
}

const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
]

/** Ordered so meta-frameworks win over their underlying bundler. */
const detectFramework = (deps: Record<string, string>): Framework => {
  if (deps.next) return 'next'
  if (deps['@angular/core']) return 'angular'
  if (deps.svelte || deps['@sveltejs/kit']) return 'svelte'
  if (deps.vue || deps.nuxt) return 'vue'
  if (deps['react-scripts']) return 'cra'
  if (deps.vite) return 'vite'
  return 'unknown'
}

const detectPackageManager = (repoDir: string): PackageManager => {
  if (existsSync(join(repoDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(repoDir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(repoDir, 'bun.lockb')) || existsSync(join(repoDir, 'bun.lock'))) return 'bun'
  return 'npm'
}

export const detectRepo = (repoDir: string): RepoInfo => {
  const pkgPath = join(repoDir, 'package.json')
  if (!existsSync(pkgPath)) throw new Error(`No package.json found in ${repoDir} — is this a JS/TS repo?`)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
    eslintConfig?: unknown
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const framework = detectFramework(deps)
  const packageManager = detectPackageManager(repoDir)

  const scriptName = ['dev', 'start', 'serve'].find((name) => pkg.scripts?.[name])
  const startCommand = scriptName ? `${packageManager} run ${scriptName}` : undefined

  const hasEslintConfig =
    ESLINT_CONFIG_FILES.some((f) => existsSync(join(repoDir, f))) || pkg.eslintConfig !== undefined

  return {
    framework,
    packageManager,
    startCommand,
    defaultPort: FRAMEWORK_PORTS[framework],
    hasEslintConfig,
    sourceDirs: existsSync(join(repoDir, 'src')) ? ['src'] : ['.'],
  }
}
