import { PassThrough } from 'node:stream'

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { run } from './cli.js'

vi.mock('./runtimes/node/cli.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./runtimes/bun/cli.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}))

const mockNodeRun = vi.mocked((await import('./runtimes/node/cli.js')).run, true)
const mockBunRun = vi.mocked((await import('./runtimes/bun/cli.js')).run, true)

describe('Main CLI entry (gex)', () => {
  let originalArgv: string[]
  let originalExitCode: number | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalArgv = process.argv
    originalExitCode = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
  })

  it('prompts and runs Bun runtime when user selects option 1 (preserving arguments)', async () => {
    const argv = ['node', 'cli.js', 'local']
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []

    output.setEncoding('utf8')
    output.on('data', (chunk) => {
      chunks.push(chunk)
    })

    const runPromise = run(argv, { input, output })

    input.write('1\n')
    input.end()

    await runPromise

    expect(chunks.join('')).toContain('gex-bun')
    expect(mockBunRun).toHaveBeenCalledWith(argv)
    expect(mockNodeRun).not.toHaveBeenCalled()
  })

  it('prompts and runs Node runtime when user selects option 2 (preserving arguments)', async () => {
    const argv = ['node', 'cli.js', 'local']
    const input = new PassThrough()
    const output = new PassThrough()

    const runPromise = run(argv, { input, output })

    input.write('2\n')
    input.end()

    await runPromise

    expect(mockNodeRun).toHaveBeenCalledWith(argv)
    expect(mockBunRun).not.toHaveBeenCalled()
  })

  it('sets a non-zero exit code on invalid selection', async () => {
    const argv = ['node', 'cli.js']
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []

    output.setEncoding('utf8')
    output.on('data', (chunk) => {
      chunks.push(chunk)
    })

    const runPromise = run(argv, { input, output })

    input.write('invalid\n')
    input.end()

    await runPromise

    expect(chunks.join('')).toContain('Invalid selection')
    expect(process.exitCode).toBe(1)
    expect(mockNodeRun).not.toHaveBeenCalled()
    expect(mockBunRun).not.toHaveBeenCalled()
  })
})
