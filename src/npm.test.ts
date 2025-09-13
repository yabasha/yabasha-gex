import { promisify } from 'node:util'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmLs, npmRootGlobal } from './npm.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(),
}))

const mockPromisify = vi.mocked(promisify)

describe('npm', () => {
  const mockExecFileAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockPromisify.mockReturnValue(mockExecFileAsync)
  })

  describe('npmLs', () => {
    it('should execute npm ls and parse JSON output', async () => {
      const mockOutput = { dependencies: { commander: { version: '12.1.0' } } }
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(mockOutput), stderr: '' })

      const result = await npmLs()

      expect(result).toEqual(mockOutput)
    })

    it('should handle empty stdout', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await npmLs()
      expect(result).toEqual({})
    })

    it('should handle JSON parsing errors from stderr', async () => {
      const error = new Error('npm ls failed') as any
      error.stdout = '{ invalid json'
      error.stderr = 'npm ERR! peer dep missing'
      mockExecFileAsync.mockRejectedValue(error)

      await expect(npmLs()).rejects.toThrow('npm ls failed: npm ERR! peer dep missing')
    })

    it('should parse JSON from error stdout when valid', async () => {
      const validOutput = { dependencies: { commander: { version: '12.1.0' } } }
      const error = new Error('npm ls failed') as any
      error.stdout = JSON.stringify(validOutput)
      mockExecFileAsync.mockRejectedValue(error)

      const result = await npmLs()
      expect(result).toEqual(validOutput)
    })
  })

  describe('npmRootGlobal', () => {
    it('should execute npm root -g and return trimmed path', async () => {
      const globalPath = '/usr/local/lib/node_modules'
      mockExecFileAsync.mockResolvedValue({ stdout: `${globalPath}\n`, stderr: '' })

      const result = await npmRootGlobal()

      expect(result).toBe(globalPath)
    })

    it('should handle npm root -g errors', async () => {
      const error = new Error('npm root failed') as any
      error.stderr = 'npm ERR! command not found'
      mockExecFileAsync.mockRejectedValue(error)

      await expect(npmRootGlobal()).rejects.toThrow(
        'npm root -g failed: npm ERR! command not found',
      )
    })
  })
})
