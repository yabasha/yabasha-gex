/**
 * @fileoverview Main CLI entry point for GEX dependency auditing tool
 */

import { createProgram } from './cli/commands.js'

/**
 * Main CLI runner function
 *
 * @param argv - Command line arguments (defaults to process.argv)
 */
export async function run(argv = process.argv): Promise<void> {
  const program = await createProgram()
  await program.parseAsync(argv)
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
