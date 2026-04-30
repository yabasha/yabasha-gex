import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmOutdated, npmUpdate, npmViewDeprecated } from './npm-cli.js'

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
