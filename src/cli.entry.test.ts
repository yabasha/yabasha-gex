import { PassThrough } from 'node:stream'

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { run } from './cli.js'

describe('Main CLI entry (gex)', () => {
  let originalExitCode: number | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalExitCode = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = originalExitCode
  })

  it('prompts and prints Bun runtime hint when user selects option 1', async () => {
    const argv = ['node', 'cli.js']
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

    const outputText = chunks.join('')
    expect(outputText).toContain('Select a runtime to use:')
    expect(outputText).toContain('gex-bun')
    expect(outputText).toContain('You selected the Bun runtime.')
  })

  it('prompts and prints Node runtime hint when user selects option 2', async () => {
    const argv = ['node', 'cli.js']
    const input = new PassThrough()
    const output = new PassThrough()

    const runPromise = run(argv, { input, output })

    input.write('2\n')
    input.end()

    await runPromise

    const outputText = output.read()?.toString('utf8') ?? ''
    expect(outputText).toContain('Select a runtime to use:')
    expect(outputText).toContain('gex-npm')
    expect(outputText).toContain('You selected the npm/Node.js runtime.')
    expect(process.exitCode).toBe(0)
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

    const outputText = chunks.join('')
    expect(outputText).toContain('Select a runtime to use:')
    expect(outputText).toContain('Invalid selection')
    expect(process.exitCode).toBe(1)
  })
})
