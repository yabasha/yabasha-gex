/**
 * @fileoverview Bun CLI runner for GEX dependency auditing tool
 *
 * This module only exports the `run` function and does not auto-execute
 * itself. Binary entrypoints (e.g. `cli-bun`) are responsible for invoking
 * `run()` when appropriate so this file can be safely imported by other
 * entrypoints without triggering side effects.
 */

import { createProgram } from './commands.js'

/**
 * Main CLI runner function for Bun runtime
 *
 * @param argv - Command line arguments (defaults to process.argv)
 */
export async function run(argv = process.argv): Promise<void> {
  const program = await createProgram()
  await program.parseAsync(argv)
}
