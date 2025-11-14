/**
 * @fileoverview CLI command definitions and handlers for Bun runtime
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'

import { Command } from 'commander'

import type { OutputFormat } from '../../shared/types.js'
import { installFromReport, printFromReport } from '../../shared/cli/install.js'
import { outputReport } from '../../shared/cli/output.js'
import { isMarkdownReportFile, loadReportFromFile } from '../../shared/cli/parser.js'
import {
  normalizeUpdateSelection,
  handleOutdatedWorkflow,
  resolveOutdatedWithNpmView,
} from '../../shared/cli/outdated.js'
import { ASCII_BANNER, getToolVersion } from '../../shared/cli/utils.js'

import { produceReport } from './report.js'
import { bunUpdate, bunPmLs } from './package-manager.js'

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
      'Output format: md or json',
      (val) => (val === 'md' ? 'md' : 'json'),
      'json',
    )
    .option('-o, --out-file <path>', 'Write report to file')
    .option('--full-tree', 'Include full bun pm ls tree (when available)', false)
    .option('-c, --check-outdated', 'List outdated packages instead of printing the report', false)
    .option(
      '-u, --update-outdated [packages...]',
      'Update outdated packages (omit package names to update every package)',
    )

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
    .description("Generate a report for the current Bun project's dependencies")

  addCommonOptions(localCmd, { allowOmitDev: true })

  localCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const omitDev = Boolean(opts.omitDev)
    const cwd = process.cwd()

    const selection = normalizeUpdateSelection(opts.updateOutdated)
    const proceed = await handleOutdatedWorkflow({
      checkOutdated: Boolean(opts.checkOutdated),
      selection,
      contextLabel: 'local',
      outFile,
      fetchOutdated: async () => {
        const tree = await bunPmLs({ cwd, omitDev })
        const manifest = await readPackageManifest(cwd)
        const declared = {
          ...(manifest?.dependencies || {}),
          ...(manifest?.optionalDependencies || {}),
          ...(manifest?.devDependencies || {}),
        }

        const packages = Object.entries(tree.dependencies).map(([name, node]) => ({
          name,
          current: node.version,
          declared: declared[name],
          type: 'prod',
        }))

        if (tree.devDependencies) {
          for (const [name, node] of Object.entries(tree.devDependencies)) {
            packages.push({
              name,
              current: node.version,
              declared: declared[name],
              type: 'dev',
            })
          }
        }

        return resolveOutdatedWithNpmView(packages)
      },
      updateRunner: selection.shouldUpdate
        ? async (packages) => {
            await bunUpdate({ cwd, packages })
          }
        : undefined,
    })

    if (!proceed) return

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
    .description('Generate a report of globally installed Bun packages')

  addCommonOptions(globalCmd, { allowOmitDev: false })

  globalCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const cwd = process.cwd()

    const selection = normalizeUpdateSelection(opts.updateOutdated)
    const proceed = await handleOutdatedWorkflow({
      checkOutdated: Boolean(opts.checkOutdated),
      selection,
      contextLabel: 'global',
      outFile,
      fetchOutdated: async () => {
        const tree = await bunPmLs({ global: true })
        const packages = Object.entries(tree.dependencies).map(([name, node]) => ({
          name,
          current: node.version,
          type: 'global',
        }))
        return resolveOutdatedWithNpmView(packages)
      },
      updateRunner: selection.shouldUpdate
        ? async (packages) => {
            await bunUpdate({ cwd, global: true, packages })
          }
        : undefined,
    })

    if (!proceed) return

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
    .argument('[report]', 'Path to report file (JSON or Markdown)', 'bun-report.json')
    .option('-r, --report <path>', 'Path to report file (JSON or Markdown)')
    .option('-p, --print', 'Print package names/versions from the report (default)', false)
    .option('-i, --install', 'Install packages from the report using Bun', false)

  readCmd.action(async (reportArg: string | undefined, opts: any) => {
    const chosen = (opts.report as string | undefined) || reportArg || 'bun-report.json'
    const reportPath = path.resolve(process.cwd(), chosen)

    try {
      const parsed = await loadReportFromFile(reportPath)

      const doInstall = Boolean(opts.install)
      const doPrint = Boolean(opts.print) || !doInstall

      if (doPrint) {
        printFromReport(parsed)
      }
      if (doInstall) {
        await installFromReport(parsed, { cwd: process.cwd(), packageManager: 'bun' })
      }
    } catch (err: any) {
      const isMd = isMarkdownReportFile(reportPath)
      const hint = isMd
        ? 'Try generating a JSON report with: gex-bun global -f json -o global.json, then: gex-bun read global.json'
        : 'Specify a report path with: gex-bun read <path-to-report.json>'
      console.error(`Failed to read report at ${reportPath}: ${err?.message || err}`)
      console.error(hint)
      process.exitCode = 1
    }
  })

  return readCmd
}

/**
 * Creates and configures the main CLI program for Bun runtime
 *
 * @returns Configured Commander program
 */
export async function createProgram(): Promise<Command> {
  const program = new Command()
    .name('gex-bun')
    .description('GEX: Dependency auditing and documentation for Bun (local and global).')
    .version(await getToolVersion())

  program.addHelpText('beforeAll', `\n${ASCII_BANNER}`)

  createLocalCommand(program)
  createGlobalCommand(program)
  createReadCommand(program)

  return program
}

async function readPackageManifest(cwd: string): Promise<any | null> {
  try {
    const raw = await readFile(path.join(cwd, 'package.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}
