import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./package-manager.js', () => ({
  pnpmPmLs: vi.fn(),
  pnpmRootGlobal: vi.fn(),
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

const mockPnpmPmLs = vi.mocked(pmModule.pnpmPmLs)
const mockPnpmRootGlobal = vi.mocked(pmModule.pnpmRootGlobal)

describe('pnpm produceReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockReset()
  })

  it('builds a local report from the pnpm tree', async () => {
    mockPnpmPmLs.mockResolvedValue({
      dependencies: {
        commander: {
          version: '14.0.1',
          path: '/repo/node_modules/.pnpm/commander@14.0.1/node_modules/commander',
        },
      },
      devDependencies: {
        vitest: {
          version: '3.2.4',
          path: '/repo/node_modules/.pnpm/vitest@3.2.4/node_modules/vitest',
        },
      },
      node_modules_path: '/repo/node_modules',
    })
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        name: 'myapp',
        version: '0.1.0',
        dependencies: { commander: '^14.0.1' },
        devDependencies: { vitest: '^3.2.4' },
      }),
    )

    const { report } = await reportModule.produceReport('local', {
      outputFormat: 'json',
      cwd: '/repo',
    })

    expect(report.project_name).toBe('myapp')
    expect(report.local_dependencies[0].name).toBe('commander')
    expect(report.local_dev_dependencies[0].name).toBe('vitest')
    expect(report.local_dependencies[0].resolved_path).toMatch(/commander/)
  })

  it('builds a global report using the resolved pnpm global root', async () => {
    mockPnpmPmLs.mockResolvedValue({
      dependencies: {
        typescript: { version: '5.4.0', path: '/g/node_modules/typescript' },
      },
    })
    mockPnpmRootGlobal.mockResolvedValue('/g/node_modules')

    const { report } = await reportModule.produceReport('global', { outputFormat: 'json' })

    expect(report.global_packages).toEqual([
      { name: 'typescript', version: '5.4.0', resolved_path: '/g/node_modules/typescript' },
    ])
  })
})
