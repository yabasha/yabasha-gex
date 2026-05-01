import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmAudit, npmOutdated, npmUpdate, npmViewDeprecated } from './npm-cli.js'

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

  describe('npmViewDeprecated', () => {
    it('returns the deprecation message when the package is deprecated', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify('request has been deprecated, see https://...'),
        stderr: '',
      })

      const result = await npmViewDeprecated('request')
      expect(result).toBe('request has been deprecated, see https://...')
      expect(mockExecFile).toHaveBeenCalledWith(
        'npm',
        ['view', 'request', 'deprecated', '--json'],
        expect.any(Object),
      )
    })

    it('returns null when the deprecated field is empty (not deprecated)', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await npmViewDeprecated('lodash')
      expect(result).toBeNull()
    })

    it('returns null when stdout is whitespace only', async () => {
      mockExecFile.mockResolvedValue({ stdout: '\n', stderr: '' })

      const result = await npmViewDeprecated('lodash')
      expect(result).toBeNull()
    })

    it('returns null when the registry call fails (missing package or no field)', async () => {
      mockExecFile.mockRejectedValue(new Error('E404 not found'))

      const result = await npmViewDeprecated('nonexistent-pkg-zzz')
      expect(result).toBeNull()
    })

    it('returns null when JSON parses to a non-string value', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'true', stderr: '' })

      const result = await npmViewDeprecated('weird-pkg')
      expect(result).toBeNull()
    })
  })
})

describe('npmAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses successful audit JSON', async () => {
    const auditJson = {
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'high',
          via: [],
          effects: [],
          range: '<4.17.21',
          nodes: [],
          fixAvailable: true,
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
      },
    }
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(auditJson), stderr: '' })

    const result = await npmAudit({ cwd: '/tmp' })
    expect(result).toEqual(auditJson)
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['audit', '--json'],
      expect.objectContaining({ cwd: '/tmp' }),
    )
  })

  it('passes --omit=dev when omitDev is set', async () => {
    mockExecFile.mockResolvedValue({ stdout: '{}', stderr: '' })
    await npmAudit({ cwd: '/tmp', omitDev: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['audit', '--json', '--omit=dev'],
      expect.any(Object),
    )
  })

  it('treats non-zero exit with parseable stdout as success (findings present)', async () => {
    const auditJson = { auditReportVersion: 2, vulnerabilities: {}, metadata: {} }
    const error: any = new Error('npm exited with code 1')
    error.stdout = JSON.stringify(auditJson)
    error.stderr = ''
    mockExecFile.mockRejectedValue(error)

    const result = await npmAudit({})
    expect(result).toEqual(auditJson)
  })

  it('throws on exec failure with no stdout', async () => {
    const error: any = new Error('ENOENT: command not found')
    error.stdout = ''
    error.stderr = 'npm: command not found'
    mockExecFile.mockRejectedValue(error)

    await expect(npmAudit({})).rejects.toThrow(/npm audit failed/)
  })

  it('throws on malformed JSON', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'not json', stderr: '' })
    await expect(npmAudit({})).rejects.toThrow(/malformed JSON/)
  })

  it('returns empty object when stdout is empty', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    const result = await npmAudit({})
    expect(result).toEqual({})
  })
})
