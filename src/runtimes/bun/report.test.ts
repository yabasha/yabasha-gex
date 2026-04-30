import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadFile = vi.fn()
const mockBunPmLs = vi.fn()
const mockBunPmRootGlobal = vi.fn()
const mockBunPmRootLocal = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}))

vi.mock('./package-manager.js', () => ({
  bunPmLs: (...args: any[]) => mockBunPmLs(...args),
  bunPmRootGlobal: (...args: any[]) => mockBunPmRootGlobal(...args),
  bunPmRootLocal: (...args: any[]) => mockBunPmRootLocal(...args),
}))

vi.mock('../../shared/cli/utils.js', () => ({
  getToolVersion: async () => '0.0.0-test',
}))

const { produceReport } = await import('./report.js')

describe('bun produceReport --from-lockfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a local report from bun.lock without invoking bun pm ls', async () => {
    const bunLock = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "demo",
      "dependencies": { "commander": "^14.0.0", },
      "devDependencies": { "typescript": "^5.0.0", },
    },
  },
  "packages": {
    "commander": ["commander@14.0.1", "", {}, "sha512-fake"],
    "typescript": ["typescript@5.6.2", "", {}, "sha512-fake"],
  }
}
`

    const pkgJson = JSON.stringify({ name: 'demo', version: '0.0.1' })

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('bun.lock')) return bunLock
      if (filePath.endsWith('package.json')) return pkgJson
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const { report } = await produceReport('local', {
      outputFormat: 'json',
      cwd: '/repo',
      fromLockfile: true,
    })

    expect(mockBunPmLs).not.toHaveBeenCalled()
    expect(report.local_dependencies).toEqual([
      expect.objectContaining({ name: 'commander', version: '14.0.1' }),
    ])
    expect(report.local_dev_dependencies).toEqual([
      expect.objectContaining({ name: 'typescript', version: '5.6.2' }),
    ])
  })

  it('falls back to package-lock.json when bun.lock is absent', async () => {
    const npmLock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { commander: '^14.0.0' } },
        'node_modules/commander': { version: '14.0.1' },
      },
    })

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('bun.lock')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      if (filePath.endsWith('package-lock.json')) return npmLock
      if (filePath.endsWith('package.json')) return JSON.stringify({ name: 'demo' })
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const { report } = await produceReport('local', {
      outputFormat: 'json',
      cwd: '/repo',
      fromLockfile: true,
    })

    expect(mockBunPmLs).not.toHaveBeenCalled()
    expect(report.local_dependencies).toEqual([
      expect.objectContaining({ name: 'commander', version: '14.0.1' }),
    ])
  })

  it('throws when no lockfile exists', async () => {
    mockReadFile.mockImplementation(async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    await expect(
      produceReport('local', {
        outputFormat: 'json',
        cwd: '/repo',
        fromLockfile: true,
      }),
    ).rejects.toThrow(/lockfile/i)

    expect(mockBunPmLs).not.toHaveBeenCalled()
  })
})
