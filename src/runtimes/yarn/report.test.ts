import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./package-manager.js', () => ({
  yarnPmLs: vi.fn(),
  yarnRootGlobal: vi.fn(),
}))

const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}))

vi.mock('../../shared/cli/utils.js', () => ({
  getToolVersion: vi.fn().mockResolvedValue('test-tool-version'),
  ASCII_BANNER: '',
}))

const pmModule = await import('./package-manager.js')
const reportModule = await import('./report.js')

const mockYarnPmLs = vi.mocked(pmModule.yarnPmLs)
const mockYarnRootGlobal = vi.mocked(pmModule.yarnRootGlobal)

describe('yarn produceReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockReset()
  })

  it('builds a local report from the yarn tree', async () => {
    mockYarnPmLs.mockResolvedValue({
      dependencies: { commander: { version: '14.0.1', path: '/repo/node_modules/commander' } },
      devDependencies: { vitest: { version: '3.2.4', path: '/repo/node_modules/vitest' } },
      node_modules_path: '/repo/node_modules',
    })
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        name: 'myapp',
        version: '0.1.0',
        description: 'desc',
        homepage: 'https://example.test',
        bugs: 'https://example.test/issues',
        dependencies: { commander: '^14.0.1' },
        devDependencies: { vitest: '^3.2.4' },
      }),
    )

    const { report, markdownExtras } = await reportModule.produceReport('local', {
      outputFormat: 'json',
      cwd: '/repo',
    })

    expect(report.tool_version).toBe('test-tool-version')
    expect(report.project_name).toBe('myapp')
    expect(report.local_dependencies).toEqual([
      { name: 'commander', version: '14.0.1', resolved_path: '/repo/node_modules/commander' },
    ])
    expect(report.local_dev_dependencies).toEqual([
      { name: 'vitest', version: '3.2.4', resolved_path: '/repo/node_modules/vitest' },
    ])
    expect(markdownExtras?.project_description).toBe('desc')
  })

  it('builds a global report using the resolved yarn global root', async () => {
    mockYarnPmLs.mockResolvedValue({
      dependencies: {
        typescript: {
          version: '5.4.0',
          path: '/Users/me/.config/yarn/global/node_modules/typescript',
        },
      },
      node_modules_path: '/Users/me/.config/yarn/global/node_modules',
    })
    mockYarnRootGlobal.mockResolvedValue('/Users/me/.config/yarn/global/node_modules')

    const { report } = await reportModule.produceReport('global', { outputFormat: 'json' })

    expect(report.global_packages).toEqual([
      {
        name: 'typescript',
        version: '5.4.0',
        resolved_path: '/Users/me/.config/yarn/global/node_modules/typescript',
      },
    ])
    expect(report.local_dependencies).toEqual([])
  })
})
