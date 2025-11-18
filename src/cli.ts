/**
 * @fileoverview Main CLI entry point for GEX dependency auditing tool.
 *
 * When invoked without subcommands or flags (bare `gex`), this entrypoint
 * presents an interactive menu so users can choose a runtime (Node/npm or Bun)
 * and a command (`local`, `global`, or `read`). The selected command is then
 * executed via the appropriate runtime-specific CLI (`gex-node` or `gex-bun`),
 * including any additional flags entered in the prompt.
 *
 * When invoked with arguments (for backward compatibility), `gex` forwards the
 * full argv to the Node runtime CLI, behaving like `gex-node`.
 */

import readline from 'node:readline'
import type { Readable, Writable } from 'node:stream'

import { run as runNodeCli } from './runtimes/node/cli.js'
import { run as runBunCli } from './runtimes/bun/cli.js'

type RuntimeKind = 'node' | 'bun'
type RuntimeCommand = 'local' | 'global' | 'read'

interface RuntimeSelectionIO {
  input?: Readable
  output?: Writable
}

interface MenuItem {
  id: string
  runtime: RuntimeKind
  command: RuntimeCommand
  label: string
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    runtime: 'node',
    command: 'local',
    label: 'gex-node local  – Node (npm) local project report',
  },
  {
    id: '2',
    runtime: 'node',
    command: 'global',
    label: 'gex-node global – Node (npm) global packages report',
  },
  {
    id: '3',
    runtime: 'node',
    command: 'read',
    label: 'gex-node read   – Node (npm) read existing report',
  },
  {
    id: '4',
    runtime: 'bun',
    command: 'local',
    label: 'gex-bun local   – Bun local project report',
  },
  {
    id: '5',
    runtime: 'bun',
    command: 'global',
    label: 'gex-bun global  – Bun global packages report',
  },
  {
    id: '6',
    runtime: 'bun',
    command: 'read',
    label: 'gex-bun read    – Bun read existing report',
  },
]

function getIO(io: RuntimeSelectionIO) {
  return {
    input: io.input ?? process.stdin,
    output: io.output ?? process.stdout,
  }
}

async function askQuestion(prompt: string, io: RuntimeSelectionIO = {}): Promise<string> {
  const { input, output } = getIO(io)

  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({ input, output })
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function parseArgLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false
      } else {
        current += ch
      }
      continue
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false
      } else {
        current += ch
      }
      continue
    }

    if (ch === "'") {
      inSingleQuote = true
      continue
    }

    if (ch === '"') {
      inDoubleQuote = true
      continue
    }

    if (ch === ' ' || ch === '\t') {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (current) {
    result.push(current)
  }

  return result
}

async function promptMenuSelection(io: RuntimeSelectionIO = {}): Promise<MenuItem | null> {
  const { output } = getIO(io)

  output.write('\nGEX interactive launcher\n')
  output.write('Choose a runtime and command to run:\n\n')

  for (const item of MENU_ITEMS) {
    output.write(`  ${item.id}) ${item.label}\n`)
  }

  output.write('  q) Quit without running anything\n\n')

  const answer = (await askQuestion('Enter your choice (1-6 or q): ', io)).trim().toLowerCase()

  if (answer === 'q' || answer === 'quit' || answer === 'exit') {
    output.write('\nExiting without running a command.\n')
    return null
  }

  const selected = MENU_ITEMS.find((item) => item.id === answer)

  if (!selected) {
    output.write('Invalid selection. Please run `gex` again and choose a valid option.\n')
    process.exitCode = 1
    return null
  }

  return selected
}

async function runInteractive(io: RuntimeSelectionIO = {}): Promise<void> {
  const selection = await promptMenuSelection(io)
  if (!selection) return

  const { output } = getIO(io)
  const binaryName = selection.runtime === 'node' ? 'gex-node' : 'gex-bun'

  output.write(`\nSelected: ${binaryName} ${selection.command}\n`)

  const extraLine = await askQuestion(
    `Enter extra flags/arguments for "${binaryName} ${selection.command}" (or press Enter for none): `,
    io,
  )

  const extraArgs = parseArgLine(extraLine.trim())
  const argv = [binaryName, selection.command, ...extraArgs]

  const renderedArgs = extraArgs.join(' ')
  const finalCommand =
    renderedArgs.length > 0
      ? `${binaryName} ${selection.command} ${renderedArgs}`
      : `${binaryName} ${selection.command}`

  output.write(`\nRunning:\n\n  ${finalCommand}\n\n`)

  if (selection.runtime === 'node') {
    await runNodeCli(argv)
  } else {
    await runBunCli(argv)
  }
}

/**
 * Main CLI runner function.
 *
 * - When invoked without subcommands or flags, presents an interactive menu and
 *   executes the chosen runtime/command via the appropriate CLI.
 * - When invoked with additional arguments, forwards argv to the Node runtime
 *   CLI for backward compatibility (behaving like `gex-node`).
 *
 * @param argv - Command line arguments (defaults to process.argv)
 * @param io - Optional streams used for interactive selection (mainly for tests)
 */
export async function run(argv = process.argv, io: RuntimeSelectionIO = {}): Promise<void> {
  const [, , ...rest] = argv

  if (rest.length > 0) {
    await runNodeCli(argv)
    return
  }

  await runInteractive(io)
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
