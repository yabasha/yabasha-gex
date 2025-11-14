import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bunPmLs } from './package-manager.js'

const mockReadFile = vi.fn()
const mockReaddir = vi.fn()
const mockAccess = vi.fn()
const mockStat = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
  readdir: (...args: any[]) => mockReaddir(...args),
  access: (...args: any[]) => mockAccess(...args),
  stat: (...args: any[]) => mockStat(...args),
}))

const files = new Map<string, string>()
const dirEntries = new Map<string, any[]>()

function addFile(filePath: string, contents: string): void {
  files.set(filePath, contents)
}

function dirent(name: string, isDirectory = true) {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  }
}

describe('bun package manager helpers', () => {
  const originalGlobalRoot = process.env.GEX_BUN_GLOBAL_ROOT
  const originalLocalRoot = process.env.GEX_BUN_LOCAL_ROOT

  beforeEach(() => {
    vi.clearAllMocks()
    files.clear()
    dirEntries.clear()
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (!files.has(filePath)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files.get(filePath) as string
    })
    mockReaddir.mockImplementation(async (dir: string) => dirEntries.get(dir) || [])
    mockAccess.mockResolvedValue(undefined)
    mockStat.mockResolvedValue({ isDirectory: () => true })
    delete process.env.GEX_BUN_LOCAL_ROOT
    delete process.env.GEX_BUN_GLOBAL_ROOT
  })

  afterEach(() => {
    process.env.GEX_BUN_GLOBAL_ROOT = originalGlobalRoot
    process.env.GEX_BUN_LOCAL_ROOT = originalLocalRoot
  })

  it('builds local dependency trees using package.json metadata', async () => {
    addFile(
      '/repo/package.json',
      JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        devDependencies: { bar: '^2.0.0' },
      }),
    )
    addFile(
      '/repo/node_modules/foo/package.json',
      JSON.stringify({ name: 'foo', version: '1.1.0' }),
    )
    addFile(
      '/repo/node_modules/bar/package.json',
      JSON.stringify({ name: 'bar', version: '2.2.0' }),
    )

    const result = await bunPmLs({ cwd: '/repo' })

    expect(result.dependencies).toEqual({
      foo: { version: '1.1.0', path: '/repo/node_modules/foo' },
    })
    expect(result.devDependencies).toEqual({
      bar: { version: '2.2.0', path: '/repo/node_modules/bar' },
    })
  })

  it('omits devDependencies when requested', async () => {
    addFile(
      '/repo/package.json',
      JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        devDependencies: { bar: '^2.0.0' },
      }),
    )
    addFile(
      '/repo/node_modules/foo/package.json',
      JSON.stringify({ name: 'foo', version: '1.1.0' }),
    )
    addFile(
      '/repo/node_modules/bar/package.json',
      JSON.stringify({ name: 'bar', version: '2.2.0' }),
    )

    const result = await bunPmLs({ cwd: '/repo', omitDev: true })

    expect(result.dependencies).toHaveProperty('foo')
    expect(result.dependencies).not.toHaveProperty('bar')
    expect(result.devDependencies).toBeUndefined()
  })

  it('falls back to scanning node_modules when package.json is unavailable', async () => {
    dirEntries.set('/repo/node_modules', [dirent('alpha'), dirent('@scope')])
    dirEntries.set('/repo/node_modules/@scope', [dirent('pkg')])
    addFile(
      '/repo/node_modules/alpha/package.json',
      JSON.stringify({ name: 'alpha', version: '0.1.0' }),
    )
    addFile(
      '/repo/node_modules/@scope/pkg/package.json',
      JSON.stringify({ name: '@scope/pkg', version: '3.4.5' }),
    )

    const result = await bunPmLs({ cwd: '/repo' })

    expect(result.dependencies).toEqual({
      alpha: { version: '0.1.0', path: '/repo/node_modules/alpha' },
      '@scope/pkg': { version: '3.4.5', path: '/repo/node_modules/@scope/pkg' },
    })
  })

  it('lists global packages from the configured Bun root', async () => {
    process.env.GEX_BUN_GLOBAL_ROOT = '/global/node_modules'
    addFile(
      '/global/package.json',
      JSON.stringify({ dependencies: { 'global-one': '^5.0.0', '@scope/pkg': '^6.0.0' } }),
    )
    dirEntries.set('/global/node_modules', [
      dirent('global-one'),
      dirent('@scope'),
      dirent('transitive'),
    ])
    dirEntries.set('/global/node_modules/@scope', [dirent('pkg')])
    addFile(
      '/global/node_modules/global-one/package.json',
      JSON.stringify({ name: 'global-one', version: '5.0.0' }),
    )
    addFile(
      '/global/node_modules/@scope/pkg/package.json',
      JSON.stringify({ name: '@scope/pkg', version: '6.1.0' }),
    )
    addFile(
      '/global/node_modules/transitive/package.json',
      JSON.stringify({ name: 'transitive', version: '1.0.0' }),
    )

    const result = await bunPmLs({ global: true })

    expect(result.dependencies).toEqual({
      'global-one': { version: '5.0.0', path: '/global/node_modules/global-one' },
      '@scope/pkg': { version: '6.1.0', path: '/global/node_modules/@scope/pkg' },
    })
    expect(result.dependencies).not.toHaveProperty('transitive')
    expect(result.devDependencies).toBeUndefined()
  })

  it('captures declared devDependencies even when package manifests are missing', async () => {
    addFile(
      '/repo/package.json',
      JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        devDependencies: { bar: '^2.0.0' },
      }),
    )
    addFile(
      '/repo/node_modules/foo/package.json',
      JSON.stringify({ name: 'foo', version: '1.1.0' }),
    )
    // intentionally omit /repo/node_modules/bar/package.json

    const result = await bunPmLs({ cwd: '/repo' })

    expect(result.devDependencies).toHaveProperty('bar')
    expect(result.devDependencies?.bar).toEqual({
      version: '^2.0.0',
      path: '/repo/node_modules/bar',
    })
  })
})
