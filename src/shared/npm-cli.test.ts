import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmAudit, npmOutdated, npmUpdate } from './npm-cli.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: (fn: any) => fn,
}))

const childProcessMock = await import('node:child_process')
const mockExecFile = vi.mocked(childProcessMock.execFile)

describe('npm cli helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses npm outdated output', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({ pkg: { current: '1.0.0', wanted: '1.1.0', latest: '2.0.0' } }),
      stderr: '',
    })

    const result = await npmOutdated()
    expect(result).toEqual([
      { name: 'pkg', current: '1.0.0', wanted: '1.1.0', latest: '2.0.0', type: undefined },
    ])
  })

  it('invokes npm update with packages', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    await npmUpdate({ cwd: '/tmp', packages: ['pkg'] })
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['update', 'pkg'],
      expect.objectContaining({ cwd: '/tmp' }),
    )
  })

  it('parses npm audit output into normalized result', async () => {
    const auditPayload = {
      auditReportVersion: 2,
      vulnerabilities: {
        minimist: {
          name: 'minimist',
          severity: 'critical',
          isDirect: true,
          via: [
            {
              source: 1179,
              name: 'minimist',
              dependency: 'minimist',
              title: 'Prototype Pollution',
              url: 'https://github.com/advisories/GHSA-vh95-rmgr-6w4m',
              severity: 'critical',
              range: '<0.2.1',
            },
          ],
          range: '<0.2.1',
          fixAvailable: true,
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 },
        dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 },
      },
    }
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(auditPayload), stderr: '' })

    const result = await npmAudit({ cwd: '/tmp' })

    expect(result.summary).toEqual({
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 1,
      total: 1,
    })
    expect(result.vulnerabilities).toEqual([
      {
        name: 'minimist',
        severity: 'critical',
        range: '<0.2.1',
        fix_available: true,
        title: 'Prototype Pollution',
        url: 'https://github.com/advisories/GHSA-vh95-rmgr-6w4m',
      },
    ])
  })

  it('parses npm audit stdout even when npm exits non-zero', async () => {
    const auditPayload = {
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      },
    }
    const err = Object.assign(new Error('npm audit exited with code 1'), {
      stdout: JSON.stringify(auditPayload),
      stderr: '',
      code: 1,
    })
    mockExecFile.mockRejectedValue(err)

    const result = await npmAudit({ cwd: '/tmp' })
    expect(result.summary.total).toBe(0)
    expect(result.vulnerabilities).toEqual([])
  })

  it('passes --omit=dev when omitDev is set', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
        },
      }),
      stderr: '',
    })
    await npmAudit({ cwd: '/tmp', omitDev: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['audit', '--json', '--omit=dev'],
      expect.objectContaining({ cwd: '/tmp' }),
    )
  })
})
