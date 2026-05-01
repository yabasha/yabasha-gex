import { promisify } from 'node:util'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { yarnPmLs, yarnRootGlobal } from './package-manager.js'

const mockReadFile = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(),
}))

const mockPromisify = vi.mocked(promisify)
const mockExecFileAsync = vi.fn()

const TREE_LINE = (entries: { name: string; version: string }[]): string =>
  JSON.stringify({
    type: 'tree',
    data: {
      type: 'list',
      trees: entries.map((entry) => ({
        name: `${entry.name}@${entry.version}`,
        children: [],
        hint: null,
        color: 'bold',
        depth: 0,
      })),
    },
  })

describe('yarn package manager helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPromisify.mockReturnValue(mockExecFileAsync)
  })

  describe('yarnPmLs (local)', () => {
    it('splits installed packages into dependencies and devDependencies using package.json', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          dependencies: { commander: '^14.0.1' },
          devDependencies: { vitest: '^3.2.4' },
        }),
      )
      const ndjson = [
        '{"type":"info","data":"yarn list v1.22.19"}',
        TREE_LINE([
          { name: 'commander', version: '14.0.1' },
          { name: 'vitest', version: '3.2.4' },
        ]),
      ].join('\n')
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--version')) return { stdout: '1.22.19\n', stderr: '' }
        return { stdout: ndjson, stderr: '' }
      })

      const tree = await yarnPmLs({ cwd: '/repo' })

      expect(tree.dependencies).toEqual({
        commander: { version: '14.0.1', path: '/repo/node_modules/commander' },
      })
      expect(tree.devDependencies).toEqual({
        vitest: { version: '3.2.4', path: '/repo/node_modules/vitest' },
      })
      expect(tree.node_modules_path).toBe('/repo/node_modules')
    })

    it('omits devDependencies when omitDev is set and passes --prod to yarn', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          dependencies: { commander: '^14.0.1' },
          devDependencies: { vitest: '^3.2.4' },
        }),
      )
      const ndjson = TREE_LINE([{ name: 'commander', version: '14.0.1' }])

      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--version')) return { stdout: '1.22.19\n', stderr: '' }
        return { stdout: ndjson, stderr: '' }
      })

      const tree = await yarnPmLs({ cwd: '/repo', omitDev: true })

      expect(tree.dependencies).toHaveProperty('commander')
      expect(tree.devDependencies).toBeUndefined()

      const listCall = mockExecFileAsync.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes('list'),
      )
      expect(listCall?.[1]).toEqual(expect.arrayContaining(['--prod']))
    })

    it('handles scoped package names in tree entries', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          dependencies: { '@scope/pkg': '^1.0.0' },
        }),
      )
      const ndjson = TREE_LINE([{ name: '@scope/pkg', version: '1.2.3' }])

      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--version')) return { stdout: '1.22.19\n', stderr: '' }
        return { stdout: ndjson, stderr: '' }
      })

      const tree = await yarnPmLs({ cwd: '/repo' })

      expect(tree.dependencies).toEqual({
        '@scope/pkg': { version: '1.2.3', path: '/repo/node_modules/@scope/pkg' },
      })
    })

    it('throws a clear error when Yarn Berry is detected', async () => {
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--version')) return { stdout: '4.5.0\n', stderr: '' }
        return { stdout: '', stderr: '' }
      })

      await expect(yarnPmLs({ cwd: '/repo' })).rejects.toThrow(/Yarn Berry/)
    })
  })

  describe('yarnPmLs (global)', () => {
    it('queries yarn global list for global packages', async () => {
      const ndjson = TREE_LINE([
        { name: 'create-react-app', version: '5.0.1' },
        { name: 'typescript', version: '5.4.0' },
      ])

      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--version')) return { stdout: '1.22.19\n', stderr: '' }
        if (args[0] === 'global' && args[1] === 'dir') {
          return { stdout: '/Users/me/.config/yarn/global\n', stderr: '' }
        }
        return { stdout: ndjson, stderr: '' }
      })

      const tree = await yarnPmLs({ global: true })

      expect(tree.dependencies).toEqual({
        'create-react-app': {
          version: '5.0.1',
          path: '/Users/me/.config/yarn/global/node_modules/create-react-app',
        },
        typescript: {
          version: '5.4.0',
          path: '/Users/me/.config/yarn/global/node_modules/typescript',
        },
      })
      expect(tree.devDependencies).toBeUndefined()
    })
  })

  describe('yarnRootGlobal', () => {
    it('returns the trimmed yarn global node_modules directory', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: '/Users/me/.config/yarn/global\n',
        stderr: '',
      })

      const result = await yarnRootGlobal()

      expect(result).toBe('/Users/me/.config/yarn/global/node_modules')
    })

    it('throws when yarn global dir fails', async () => {
      const error = new Error('yarn global dir failed') as any
      error.stderr = 'yarn ERR'
      mockExecFileAsync.mockRejectedValue(error)

      await expect(yarnRootGlobal()).rejects.toThrow(/yarn global dir/)
    })
  })
})
