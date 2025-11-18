/**
 * @fileoverview Main CLI entry point for GEX dependency auditing tool
 *
 * When invoked without subcommands or flags (bare `gex`), this entrypoint
 * presents an interactive selector so users can choose between the npm/Node
 * runtime and the Bun runtime:
 *
 *   1) gex-bun
 *   2) gex-npm
 */

import readline from 'node:readline'
import type { Readable, Writable } from 'node:stream'

import { run as runNodeCLI } from './runtimes/node/cli.js'
import { run as runBunCLI } from './runtimes/bun/cli.js'

type RuntimeChoice = 'bun' | 'npm' | null

interface RuntimeSelectionIO {
  input?: Readable
  output?: Writable
}

async function promptRuntimeSelection(io: RuntimeSelectionIO = {}): Promise<RuntimeChoice> {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stdout

  return new Promise<RuntimeChoice>((resolve) => {
    const rl = readline.createInterface({ input, output })

    output.write('\nSelect a runtime to use:\n')
    output.write('  1) gex-bun (Bun package manager)\n')
    output.write('  2) gex-npm (npm / Node.js package manager)\n\n')

    rl.question('Enter your choice (1-2): ', (answer) => {
      rl.close()

      const choice = answer.trim().toLowerCase()

      if (choice === '1' || choice === 'gex-bun' || choice === 'bun') {
        resolve('bun')
        return
      }

      if (
        choice === '2' ||
        choice === 'gex-npm' ||
        choice === 'gex-node' ||
        choice === 'npm' ||
        choice === 'node'
      ) {
        resolve('npm')
        return
      }

      resolve(null)
    })
  })
}

/**
 * Main CLI runner function
 *
 * @param argv - Command line arguments (defaults to process.argv)
 * @param io - Optional streams used for interactive selection (mainly for tests)
 */
export async function run(argv = process.argv, io: RuntimeSelectionIO = {}): Promise<void> {
  const effectiveArgv = argv ?? process.argv
  const choice = await promptRuntimeSelection(io)

  if (choice === 'bun') {
    await runBunCLI(effectiveArgv)
    return
  }

  if (choice === 'npm') {
    await runNodeCLI(effectiveArgv)
    return
  }

  const output = io.output ?? process.stdout
  output.write('Invalid selection. Please run `gex` again and choose 1 or 2.\n')
  process.exitCode = 1
}

const isMainModule = (() => {
  try {
    if (typeof require !== 'undefined' && typeof module !== 'undefined') {
      return (require as any).main === module
    }

    if (typeof import.meta !== 'undefined') {
      return import.meta.url === `file://${process.argv[1]}`
    }
    return false
  } catch {
    return false
  }
})()

if (isMainModule) {
  run().catch((error) => {
    console.error('CLI error:', error)
    process.exitCode = 1
  })
}
