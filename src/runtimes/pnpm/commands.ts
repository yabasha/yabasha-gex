/**
 * @fileoverview CLI command definitions and handlers for the pnpm runtime.
 */

import path from 'node:path'

import { Command } from 'commander'

import type { OutputFormat } from '../../shared/types.js'
import { installFromReport, printFromReport } from '../../shared/cli/install.js'
import { outputReport } from '../../shared/cli/output.js'
import { isMarkdownReportFile, loadReportFromFile } from '../../shared/cli/parser.js'
import { ASCII_BANNER, getToolVersion } from '../../shared/cli/utils.js'

import { produceReport } from './report.js'

function addCommonOptions(cmd: Command, { allowOmitDev }: { allowOmitDev: boolean }): Command {
  cmd
    .option(
      '-f, --output-format <format>',
      'Output format: md or json',
      (val) => (val === 'md' ? 'md' : 'json'),
      'json',
    )
    .option('-o, --out-file <path>', 'Write report to file')
    .option('--full-tree', 'Include full pnpm list tree (when available)', false)

  if (allowOmitDev) {
    cmd.option('--omit-dev', 'Exclude devDependencies (local only)', false)
  }

  return cmd
}

export function createLocalCommand(program: Command): Command {
  const localCmd = program
    .command('local', { isDefault: true })
    .description("Generate a report for the current pnpm project's dependencies")

  addCommonOptions(localCmd, { allowOmitDev: true })

  localCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const omitDev = Boolean(opts.omitDev)

    const { report, markdownExtras } = await produceReport('local', {
      outputFormat,
      outFile,
      fullTree,
      omitDev,
    })

    await outputReport(report, outputFormat, outFile, markdownExtras)
  })

  return localCmd
}

export function createGlobalCommand(program: Command): Command {
  const globalCmd = program
    .command('global')
    .description('Generate a report of globally installed pnpm packages')

  addCommonOptions(globalCmd, { allowOmitDev: false })

  globalCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)

    const { report, markdownExtras } = await produceReport('global', {
      outputFormat,
      outFile,
      fullTree,
    })

    await outputReport(report, outputFormat, outFile, markdownExtras)
  })

  return globalCmd
}

export function createReadCommand(program: Command): Command {
  const readCmd = program
    .command('read')
    .description(
      'Read a previously generated report (JSON or Markdown) and either print package names or install them',
    )
    .argument('[report]', 'Path to report file (JSON or Markdown)', 'pnpm-report.json')
    .option('-r, --report <path>', 'Path to report file (JSON or Markdown)')
    .option('-p, --print', 'Print package names/versions from the report (default)', false)
    .option('-i, --install', 'Install packages from the report using pnpm', false)

  readCmd.action(async (reportArg: string | undefined, opts: any) => {
    const chosen = (opts.report as string | undefined) || reportArg || 'pnpm-report.json'
    const reportPath = path.resolve(process.cwd(), chosen)

    try {
      const parsed = await loadReportFromFile(reportPath)

      const doInstall = Boolean(opts.install)
      const doPrint = Boolean(opts.print) || !doInstall

      if (doPrint) {
        printFromReport(parsed)
      }
      if (doInstall) {
        await installFromReport(parsed, { cwd: process.cwd(), packageManager: 'pnpm' })
      }
    } catch (err: any) {
      const isMd = isMarkdownReportFile(reportPath)
      const hint = isMd
        ? 'Try generating a JSON report with: gex-pnpm global -f json -o global.json, then: gex-pnpm read global.json'
        : 'Specify a report path with: gex-pnpm read <path-to-report.json>'
      console.error(`Failed to read report at ${reportPath}: ${err?.message || err}`)
      console.error(hint)
      process.exitCode = 1
    }
  })

  return readCmd
}

export async function createProgram(): Promise<Command> {
  const program = new Command()
    .name('gex-pnpm')
    .description('GEX: Dependency auditing and documentation for pnpm (local and global).')
    .version(await getToolVersion())

  program.addHelpText('beforeAll', `\n${ASCII_BANNER}`)

  createLocalCommand(program)
  createGlobalCommand(program)
  createReadCommand(program)

  return program
}
