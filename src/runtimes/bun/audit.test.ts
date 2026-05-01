import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bunAudit } from './audit.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: (fn: any) => fn,
}))

const childProcessMock = await import('node:child_process')
const mockExecFile = vi.mocked(childProcessMock.execFile)

describe('bunAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses bun audit --json output', async () => {
    const payload = {
      vulnerabilities: {
        axios: {
          name: 'axios',
          severity: 'high',
          range: '<1.6.5',
          fixAvailable: true,
          via: [{ title: 'SSRF', url: 'https://example.com', severity: 'high', range: '<1.6.5' }],
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
      },
    }
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(payload), stderr: '' })

    const result = await bunAudit({ cwd: '/tmp' })

    expect(mockExecFile).toHaveBeenCalledWith(
      'bun',
      ['audit', '--json'],
      expect.objectContaining({ cwd: '/tmp' }),
    )
    expect(result.summary.high).toBe(1)
    expect(result.vulnerabilities[0]).toMatchObject({
      name: 'axios',
      severity: 'high',
      fix_available: true,
      title: 'SSRF',
    })
  })

  it('passes --prod when production option is set', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
        },
      }),
      stderr: '',
    })

    await bunAudit({ cwd: '/tmp', production: true })

    expect(mockExecFile).toHaveBeenCalledWith(
      'bun',
      ['audit', '--json', '--prod'],
      expect.objectContaining({ cwd: '/tmp' }),
    )
  })

  it('parses stdout when bun audit exits non-zero', async () => {
    const err = Object.assign(new Error('bun audit exited 1'), {
      stdout: JSON.stringify({
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
        },
      }),
      stderr: '',
      code: 1,
    })
    mockExecFile.mockRejectedValue(err)

    const result = await bunAudit({ cwd: '/tmp' })
    expect(result.summary.total).toBe(0)
    expect(result.vulnerabilities).toEqual([])
  })

  it('throws a useful error when bun cannot be executed', async () => {
    mockExecFile.mockRejectedValue(Object.assign(new Error('command not found'), { stderr: '' }))
    await expect(bunAudit({ cwd: '/tmp' })).rejects.toThrow(/bun audit failed/)
  })
})
