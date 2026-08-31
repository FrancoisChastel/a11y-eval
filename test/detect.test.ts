import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { detectRepo } from '../src/repo/detect.ts'

const makeRepo = (pkg: object, extraFiles: string[] = []): string => {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-detect-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  for (const f of extraFiles) {
    mkdirSync(join(dir, f.split('/').slice(0, -1).join('/') || '.'), { recursive: true })
    writeFileSync(join(dir, f), '')
  }
  return dir
}

describe('detectRepo', () => {
  test('detects Next.js with pnpm and dev script', () => {
    const dir = makeRepo(
      { dependencies: { next: '15.0.0', react: '19.0.0' }, scripts: { dev: 'next dev' } },
      ['pnpm-lock.yaml'],
    )
    const info = detectRepo(dir)
    expect(info.framework).toBe('next')
    expect(info.packageManager).toBe('pnpm')
    expect(info.startCommand).toBe('pnpm run dev')
    expect(info.defaultPort).toBe(3000)
  })

  test('detects Vite with npm fallback and port 5173', () => {
    const dir = makeRepo({ devDependencies: { vite: '6.0.0' }, scripts: { dev: 'vite' } })
    const info = detectRepo(dir)
    expect(info.framework).toBe('vite')
    expect(info.packageManager).toBe('npm')
    expect(info.defaultPort).toBe(5173)
  })

  test('detects Angular on port 4200 preferring start script when no dev script', () => {
    const dir = makeRepo({ dependencies: { '@angular/core': '19.0.0' }, scripts: { start: 'ng serve' } }, ['yarn.lock'])
    const info = detectRepo(dir)
    expect(info.framework).toBe('angular')
    expect(info.startCommand).toBe('yarn run start')
    expect(info.defaultPort).toBe(4200)
  })

  test('reports eslint config presence and src dir', () => {
    const withConfig = detectRepo(makeRepo({}, ['eslint.config.mjs', 'src/App.tsx']))
    expect(withConfig.hasEslintConfig).toBe(true)
    expect(withConfig.sourceDirs).toEqual(['src'])

    const without = detectRepo(makeRepo({}))
    expect(without.hasEslintConfig).toBe(false)
    expect(without.sourceDirs).toEqual(['.'])
  })

  test('unknown framework and no start command when no scripts exist', () => {
    const info = detectRepo(makeRepo({ dependencies: { lodash: '4.0.0' } }))
    expect(info.framework).toBe('unknown')
    expect(info.startCommand).toBeUndefined()
  })
})
