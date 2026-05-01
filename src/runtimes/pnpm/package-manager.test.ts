import { promisify } from 'node:util'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pnpmPmLs, pnpmRootGlobal } from './package-manager.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(),
}))

const mockPromisify = vi.mocked(promisify)
const mockExecFileAsync = vi.fn()

describe('pnpm package manager helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPromisify.mockReturnValue(mockExecFileAsync)
  })

  describe('pnpmPmLs (local)', () => {
    it('parses pnpm list JSON array output', async () => {
      const stdout = JSON.stringify([
        {
          name: 'myapp',
          version: '0.1.0',
          path: '/repo',
          dependencies: {
            commander: {
              from: 'commander',
              version: '14.0.1',
              resolved: 'https://registry.npmjs.org/commander/-/commander-14.0.1.tgz',
              path: '/repo/node_modules/.pnpm/commander@14.0.1/node_modules/commander',
            },
          },
          devDependencies: {
            vitest: {
              from: 'vitest',
              version: '3.2.4',
              resolved: 'https://registry.npmjs.org/vitest/-/vitest-3.2.4.tgz',
              path: '/repo/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest',
            },
          },
        },
      ])
      mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' })

      const tree = await pnpmPmLs({ cwd: '/repo' })

      expect(tree.dependencies).toEqual({
        commander: {
          version: '14.0.1',
          path: '/repo/node_modules/.pnpm/commander@14.0.1/node_modules/commander',
        },
      })
      expect(tree.devDependencies).toEqual({
        vitest: {
          version: '3.2.4',
          path: '/repo/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest',
        },
      })
    })

    it('omits devDependencies when omitDev is set and passes --prod to pnpm', async () => {
      const stdout = JSON.stringify([
        {
          name: 'myapp',
          path: '/repo',
          dependencies: {
            commander: { version: '14.0.1', path: '/repo/node_modules/commander' },
          },
        },
      ])
      mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' })

      const tree = await pnpmPmLs({ cwd: '/repo', omitDev: true })

      expect(tree.dependencies).toHaveProperty('commander')
      expect(tree.devDependencies).toBeUndefined()
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'pnpm',
        expect.arrayContaining(['list', '--json', '--depth=0', '--prod']),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    it('returns empty tree when pnpm output is empty', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      const tree = await pnpmPmLs({ cwd: '/repo' })

      expect(tree.dependencies).toEqual({})
      expect(tree.devDependencies).toEqual({})
    })

    it('falls back gracefully on missing version/path fields', async () => {
      const stdout = JSON.stringify([
        {
          name: 'myapp',
          dependencies: {
            'no-version': { from: 'no-version' },
          },
        },
      ])
      mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' })

      const tree = await pnpmPmLs({ cwd: '/repo' })

      expect(tree.dependencies['no-version']).toEqual({ version: '', path: '' })
    })

    it('throws a helpful error when pnpm fails without recoverable stdout', async () => {
      const error = new Error('pnpm exited 1') as any
      error.stderr = 'ERR_PNPM_NO_LOCKFILE'
      mockExecFileAsync.mockRejectedValue(error)

      await expect(pnpmPmLs({ cwd: '/repo' })).rejects.toThrow(/pnpm list/)
    })
  })

  describe('pnpmPmLs (global)', () => {
    it('passes --global when listing globals', async () => {
      const stdout = JSON.stringify([
        {
          name: '<global>',
          dependencies: {
            typescript: { version: '5.4.0', path: '/g/node_modules/typescript' },
          },
        },
      ])
      mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' })

      const tree = await pnpmPmLs({ global: true })

      expect(tree.dependencies).toHaveProperty('typescript')
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'pnpm',
        expect.arrayContaining(['list', '--json', '--depth=0', '--global']),
        expect.any(Object),
      )
    })
  })

  describe('pnpmRootGlobal', () => {
    it('returns the trimmed pnpm root -g path', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: '/Users/me/Library/pnpm/global/5/node_modules\n',
        stderr: '',
      })

      const result = await pnpmRootGlobal()

      expect(result).toBe('/Users/me/Library/pnpm/global/5/node_modules')
    })

    it('throws when pnpm root -g fails', async () => {
      const error = new Error('pnpm root failed') as any
      error.stderr = 'pnpm: command not found'
      mockExecFileAsync.mockRejectedValue(error)

      await expect(pnpmRootGlobal()).rejects.toThrow(/pnpm root/)
    })
  })
})
