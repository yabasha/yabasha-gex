import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmOutdated, npmUpdate } from './npm-cli.js'

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
})
