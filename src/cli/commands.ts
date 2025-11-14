/**
 * @fileoverview CLI command definitions and handlers
 */

import path from 'node:path'

import { Command } from 'commander'

import type { OutputFormat } from '../types.js'

import { installFromReport, printFromReport } from './install.js'
import { outputReport } from './output.js'
import { isMarkdownReportFile, loadReportFromFile } from './parser.js'
import { produceReport } from './report.js'
import { ASCII_BANNER, getToolVersion } from './utils.js'

/**
 * Adds common options to a command
 *
 * @param cmd - Command to add options to
 * @param options - Configuration for which options to add
 * @returns Modified command
 */
function addCommonOptions(cmd: Command, { allowOmitDev }: { allowOmitDev: boolean }): Command {
  cmd
    .option(
      '-f, --output-format <format>',
      'Output format: json, md, or html',
      (val) => {
        if (val === 'md') return 'md'
        if (val === 'html') return 'html'
        return 'json'
      },
      'json',
    )
    .option('-o, --out-file <path>', 'Write report to file')
    .option('--full-tree', 'Include full npm ls tree (omit depth=0 default)', false)

  if (allowOmitDev) {
    cmd.option('--omit-dev', 'Exclude devDependencies (local only)', false)
  }

  return cmd
}

/**
 * Creates the local command handler
 *
 * @param program - Commander program instance
 * @returns Command instance
 */
export function createLocalCommand(program: Command): Command {
  const localCmd = program
    .command('local', { isDefault: true })
    .description("Generate a report for the current project's dependencies")

  addCommonOptions(localCmd, { allowOmitDev: true })

  localCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const omitDev = Boolean(opts.omitDev)

    // Only set finalOutFile when explicitly provided via --out-file
    const finalOutFile = outFile

    const { report, markdownExtras } = await produceReport('local', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
      omitDev,
    })

    await outputReport(report, outputFormat, finalOutFile, markdownExtras)
  })

  return localCmd
}

/**
 * Creates the global command handler
 *
 * @param program - Commander program instance
 * @returns Command instance
 */
export function createGlobalCommand(program: Command): Command {
  const globalCmd = program
    .command('global')
    .description('Generate a report of globally installed packages')

  addCommonOptions(globalCmd, { allowOmitDev: false })

  globalCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)

    // Only set finalOutFile when explicitly provided via --out-file
    const finalOutFile = outFile

    const { report, markdownExtras } = await produceReport('global', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
    })

    await outputReport(report, outputFormat, finalOutFile, markdownExtras)
  })

  return globalCmd
}

/**
 * Creates the read command handler
 *
 * @param program - Commander program instance
 * @returns Command instance
 */
export function createReadCommand(program: Command): Command {
  const readCmd = program
    .command('read')
    .description(
      'Read a previously generated report (JSON or Markdown) and either print package names or install them',
    )
    .argument('[report]', 'Path to report file (JSON or Markdown)', 'gex-report.json')
    .option('-r, --report <path>', 'Path to report file (JSON or Markdown)')
    .option('-p, --print', 'Print package names/versions from the report (default)', false)
    .option('-i, --install', 'Install packages from the report', false)

  readCmd.action(async (reportArg: string | undefined, opts: any) => {
    const chosen = (opts.report as string | undefined) || reportArg || 'gex-report.json'
    const reportPath = path.resolve(process.cwd(), chosen)

    try {
      const parsed = await loadReportFromFile(reportPath)

      const doInstall = Boolean(opts.install)
      const doPrint = Boolean(opts.print) || !doInstall

      if (doPrint) {
        printFromReport(parsed)
      }
      if (doInstall) {
        await installFromReport(parsed, { cwd: process.cwd(), packageManager: 'npm' })
      }
    } catch (err: any) {
      const isMd = isMarkdownReportFile(reportPath)
      const hint = isMd
        ? 'Try generating a JSON report with: gex global -f json -o global.json, then: gex read global.json'
        : 'Specify a report path with: gex read <path-to-report.json>'
      console.error(`Failed to read report at ${reportPath}: ${err?.message || err}`)
      console.error(hint)
      process.exitCode = 1
    }
  })

  return readCmd
}

/**
 * Creates and configures the main CLI program
 *
 * @returns Configured Commander program
 */
export async function createProgram(): Promise<Command> {
  const program = new Command()
    .name('gex')
    .description('GEX: Dependency auditing and documentation for Node.js (local and global).')
    .version(await getToolVersion())

  program.addHelpText('beforeAll', `\n${ASCII_BANNER}`)

  createLocalCommand(program)
  createGlobalCommand(program)
  createReadCommand(program)

  return program
}
