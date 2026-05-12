import { promisify } from 'node:util'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Report } from '../types.js'

import { installFromReport } from './install.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(),
}))

const mockPromisify = vi.mocked(promisify)

describe('installFromReport', () => {
  const execFileAsync = vi.fn()
  const baseReport: Report = {
    report_version: '1.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    tool_version: 'test',
    global_packages: [{ name: '@scope/pkg', version: '1.0.0', resolved_path: '' }],
    local_dependencies: [{ name: 'dep', version: '2.0.0', resolved_path: '' }],
    local_dev_dependencies: [{ name: 'dev-dep', version: '', resolved_path: '' }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    execFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    mockPromisify.mockReturnValue(execFileAsync as any)
  })

  it('installs packages with npm by default (with --ignore-scripts)', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project' })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['i', '-g', '--ignore-scripts', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['i', '--ignore-scripts', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['i', '-D', '--ignore-scripts', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('installs packages with bun when requested', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', packageManager: 'bun' })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'bun',
      ['add', '-g', '--ignore-scripts', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'bun',
      ['add', '--ignore-scripts', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'bun',
      ['add', '-d', '--ignore-scripts', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('installs packages with yarn when requested', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', packageManager: 'yarn' })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'yarn',
      ['global', 'add', '--ignore-scripts', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'yarn',
      ['add', '--ignore-scripts', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'yarn',
      ['add', '-D', '--ignore-scripts', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('installs packages with pnpm when requested', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', packageManager: 'pnpm' })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['add', '-g', '--ignore-scripts', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['add', '--ignore-scripts', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'pnpm',
      ['add', '-D', '--ignore-scripts', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('sets env-var safety (YARN_ENABLE_SCRIPTS + npm_config_ignore_scripts) by default', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', packageManager: 'yarn' })

    expect(execFileAsync).toHaveBeenCalled()
    const callArgs = execFileAsync.mock.calls[0][2] as { env?: Record<string, string | undefined> }
    expect(callArgs.env).toBeDefined()
    expect(callArgs.env!.YARN_ENABLE_SCRIPTS).toBe('false')
    expect(callArgs.env!.npm_config_ignore_scripts).toBe('true')
  })

  it('does not override env when allowScripts is true', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', allowScripts: true })

    expect(execFileAsync).toHaveBeenCalled()
    const callArgs = execFileAsync.mock.calls[0][2] as { env?: Record<string, string | undefined> }
    expect(callArgs.env).toBeUndefined()
  })

  it('omits --ignore-scripts when allowScripts is true', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', allowScripts: true })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['i', '-g', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['i', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'npm',
      ['i', '-D', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('rejects flag-shaped package names (registry hijack vector)', async () => {
    await expect(
      installFromReport(
        {
          ...baseReport,
          global_packages: [],
          local_dependencies: [{ name: '--registry=http://evil/', version: '', resolved_path: '' }],
          local_dev_dependencies: [],
        },
        { cwd: '/tmp/project' },
      ),
    ).rejects.toThrow(/invalid characters|cannot start with/)

    expect(execFileAsync).not.toHaveBeenCalled()
  })

  it("rejects package names starting with '-' (npm flag injection)", async () => {
    await expect(
      installFromReport(
        {
          ...baseReport,
          global_packages: [],
          local_dependencies: [{ name: '-g', version: '', resolved_path: '' }],
          local_dev_dependencies: [],
        },
        { cwd: '/tmp/project' },
      ),
    ).rejects.toThrow(/invalid characters|cannot start with/)

    expect(execFileAsync).not.toHaveBeenCalled()
  })

  it('rejects versions containing shell-like characters', async () => {
    await expect(
      installFromReport(
        {
          ...baseReport,
          global_packages: [],
          local_dependencies: [{ name: 'lodash', version: '1.0.0; rm -rf /', resolved_path: '' }],
          local_dev_dependencies: [],
        },
        { cwd: '/tmp/project' },
      ),
    ).rejects.toThrow(/invalid characters/)

    expect(execFileAsync).not.toHaveBeenCalled()
  })

  it('skips installation when no packages are present', async () => {
    await installFromReport(
      {
        ...baseReport,
        global_packages: [],
        local_dependencies: [],
        local_dev_dependencies: [],
      },
      { cwd: '/tmp/project' },
    )

    expect(execFileAsync).not.toHaveBeenCalled()
  })
})
