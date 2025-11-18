import { PassThrough } from 'node:stream'

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./runtimes/node/cli.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./runtimes/bun/cli.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}))

import { run } from './cli.js'
import { run as runNodeCli } from './runtimes/node/cli.js'
import { run as runBunCli } from './runtimes/bun/cli.js'

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

  it('shows the interactive menu and executes gex-node local with no extra args', async () => {
    const argv = ['node', 'cli.js']
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []

    output.setEncoding('utf8')
    output.on('data', (chunk) => {
      chunks.push(chunk)
    })

    const runPromise = run(argv, { input, output })

    // Select menu item 1 (gex-node local) and press Enter for no extra flags
    input.write('1\n')
    input.write('\n')
    input.end()

    await runPromise

    const outputText = chunks.join('')
    expect(outputText).toContain('GEX interactive launcher')
    expect(outputText).toContain('gex-node local')
    expect(outputText).toContain('Enter extra flags/arguments')
    expect(outputText).toContain('Running:')
    expect(outputText).toContain('gex-node local')

    const nodeRunMock = vi.mocked(runNodeCli)
    expect(nodeRunMock).toHaveBeenCalledTimes(1)
    expect(nodeRunMock).toHaveBeenCalledWith(['gex-node', 'local'])
  })

  it('allows selecting a Bun command and executes it with extra flags', async () => {
    const argv = ['node', 'cli.js']
    const input = new PassThrough()
    const output = new PassThrough()

    const runPromise = run(argv, { input, output })

    // Select menu item 4 (gex-bun local) and provide extra flags
    input.write('4\n')
    input.write('--full-tree -f md\n')
    input.end()

    await runPromise

    const bunRunMock = vi.mocked(runBunCli)
    expect(bunRunMock).toHaveBeenCalledTimes(1)
    expect(bunRunMock).toHaveBeenCalledWith(['gex-bun', 'local', '--full-tree', '-f', 'md'])
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
    expect(outputText).toContain('Invalid selection')
    expect(process.exitCode).toBe(1)
  })

  it('forwards argv with extra arguments directly to the Node CLI', async () => {
    const argv = ['node', 'cli.js', 'local', '--check-outdated']

    await run(argv)

    const nodeRunMock = vi.mocked(runNodeCli)
    expect(nodeRunMock).toHaveBeenCalledTimes(1)
    expect(nodeRunMock).toHaveBeenCalledWith(argv)
  })
})
