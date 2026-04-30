import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadFile = vi.fn()
const mockNpmLs = vi.fn()
const mockNpmRootGlobal = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}))

vi.mock('./package-manager.js', () => ({
  npmLs: (...args: any[]) => mockNpmLs(...args),
  npmRootGlobal: (...args: any[]) => mockNpmRootGlobal(...args),
}))

vi.mock('../../shared/cli/utils.js', () => ({
  getToolVersion: async () => '0.0.0-test',
}))

const { produceReport } = await import('./report.js')

describe('node produceReport --from-lockfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a local report from package-lock.json without invoking npm ls', async () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { commander: '^14.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        },
        'node_modules/commander': { version: '14.0.1' },
        'node_modules/typescript': { version: '5.6.2', dev: true },
      },
    })

    const pkgJson = JSON.stringify({
      name: 'demo',
      version: '0.0.1',
      description: 'demo project',
    })

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('package-lock.json')) return lockfile
      if (filePath.endsWith('package.json')) return pkgJson
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const { report } = await produceReport('local', {
      outputFormat: 'json',
      cwd: '/repo',
      fromLockfile: true,
    })

    expect(mockNpmLs).not.toHaveBeenCalled()
    expect(report.project_name).toBe('demo')
    expect(report.local_dependencies).toEqual([
      expect.objectContaining({ name: 'commander', version: '14.0.1' }),
    ])
    expect(report.local_dev_dependencies).toEqual([
      expect.objectContaining({ name: 'typescript', version: '5.6.2' }),
    ])
  })

  it('throws a clear error when the lockfile is missing', async () => {
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

    expect(mockNpmLs).not.toHaveBeenCalled()
  })
})
