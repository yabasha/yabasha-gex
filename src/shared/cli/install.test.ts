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

  it('installs packages with npm by default', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project' })

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

  it('installs packages with bun when requested', async () => {
    await installFromReport(baseReport, { cwd: '/tmp/project', packageManager: 'bun' })

    expect(execFileAsync).toHaveBeenCalledTimes(3)
    expect(execFileAsync).toHaveBeenNthCalledWith(
      1,
      'bun',
      ['add', '-g', '@scope/pkg@1.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      2,
      'bun',
      ['add', 'dep@2.0.0'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
    expect(execFileAsync).toHaveBeenNthCalledWith(
      3,
      'bun',
      ['add', '-d', 'dev-dep'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
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
