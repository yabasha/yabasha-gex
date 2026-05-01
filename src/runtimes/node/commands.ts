/**
 * @fileoverview CLI command definitions and handlers
 */

import path from 'node:path'

import { Command } from 'commander'

import type { OutputFormat } from '../../shared/types.js'
import { installFromReport, printFromReport } from '../../shared/cli/install.js'
import { outputReport } from '../../shared/cli/output.js'
import { isMarkdownReportFile, loadReportFromFile } from '../../shared/cli/parser.js'
import {
  normalizeUpdateSelection,
  handleOutdatedWorkflow,
  formatOutdatedTable,
} from '../../shared/cli/outdated.js'
import { applyDeprecatedCheck } from '../../shared/cli/deprecated.js'
import { npmAudit, npmOutdated, npmUpdate } from '../../shared/npm-cli.js'
import { ASCII_BANNER, getToolVersion } from '../../shared/cli/utils.js'
import {
  attachAuditToReport,
  formatAuditTable,
  normalizeNpmAudit,
  parseFailOn,
  runAuditWorkflow,
  type AuditNormalizer,
} from '../../shared/cli/audit.js'

import { produceReport } from './report.js'

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
    .option('--full-tree', 'Include full npm ls tree (omit depth=0 default)', false)
    .option('-c, --check-outdated', 'List outdated packages instead of printing the report', false)
    .option(
      '-u, --update-outdated [packages...]',
      'Update outdated packages (omit package names to update every package)',
    )
    .option('--check-deprecated', 'Flag packages marked deprecated in the npm registry', false)

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
    const cwd = process.cwd()

    const selection = normalizeUpdateSelection(opts.updateOutdated)
    const result = await handleOutdatedWorkflow({
      checkOutdated: Boolean(opts.checkOutdated),
      selection,
      contextLabel: 'local',
      outFile,
      fetchOutdated: () => npmOutdated({ cwd }),
      updateRunner: selection.shouldUpdate
        ? async (packages) => {
            await npmUpdate({ cwd, packages })
          }
        : undefined,
    })
    if (opts.checkOutdated) {
      if (result.outdated.length === 0) console.log('All local packages are up to date.')
      else console.log(formatOutdatedTable(result.outdated))
    }
    if (!result.proceed) return

    // Only set finalOutFile when explicitly provided via --out-file
    const finalOutFile = outFile

    const { report, markdownExtras } = await produceReport('local', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
      omitDev,
    })

    const deprecatedResult = await applyDeprecatedCheck(report, {
      checkDeprecated: Boolean(opts.checkDeprecated),
      context: 'local',
      outFile: finalOutFile,
    })
    if (!deprecatedResult.proceed) return

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
    const cwd = process.cwd()

    const selection = normalizeUpdateSelection(opts.updateOutdated)
    const result = await handleOutdatedWorkflow({
      checkOutdated: Boolean(opts.checkOutdated),
      selection,
      contextLabel: 'global',
      outFile,
      fetchOutdated: () => npmOutdated({ cwd, global: true }),
      updateRunner: selection.shouldUpdate
        ? async (packages) => {
            await npmUpdate({ cwd, global: true, packages })
          }
        : undefined,
    })
    if (opts.checkOutdated) {
      if (result.outdated.length === 0) console.log('All global packages are up to date.')
      else console.log(formatOutdatedTable(result.outdated))
    }
    if (!result.proceed) return

    // Only set finalOutFile when explicitly provided via --out-file
    const finalOutFile = outFile

    const { report, markdownExtras } = await produceReport('global', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
    })

    const deprecatedResult = await applyDeprecatedCheck(report, {
      checkDeprecated: Boolean(opts.checkDeprecated),
      context: 'global',
      outFile: finalOutFile,
    })
    if (!deprecatedResult.proceed) return

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
 * Creates the audit command handler
 *
 * @param program - Commander program instance
 * @returns Command instance
 */
export function createAuditCommand(program: Command): Command {
  const auditCmd = program
    .command('audit')
    .description('Run a vulnerability audit and embed it in the report')

  addCommonOptions(auditCmd, { allowOmitDev: true })
  auditCmd.option(
    '--fail-on <severity>',
    'Exit 1 when severity at or above threshold is present (low|moderate|high|critical). Exit 2 if the threshold itself is invalid.',
  )

  auditCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const omitDev = Boolean(opts.omitDev)
    const cwd = process.cwd()

    let failOn
    try {
      failOn = parseFailOn(opts.failOn)
    } catch (err: any) {
      console.error(err?.message || 'Invalid --fail-on value')
      process.exitCode = 2
      return
    }

    const selection = normalizeUpdateSelection(opts.updateOutdated)
    // outdatedResult.proceed is intentionally not honored: gex audit always continues
    // to produce the report, regardless of --check-outdated output.
    const outdatedResult = await handleOutdatedWorkflow({
      checkOutdated: Boolean(opts.checkOutdated),
      selection,
      contextLabel: 'local',
      outFile,
      fetchOutdated: () => npmOutdated({ cwd }),
      updateRunner: selection.shouldUpdate
        ? async (packages) => {
            await npmUpdate({ cwd, packages })
          }
        : undefined,
    })
    if (opts.checkOutdated) {
      if (outdatedResult.outdated.length === 0) {
        console.log('All local packages are up to date.')
      } else {
        console.log(formatOutdatedTable(outdatedResult.outdated))
      }
    }

    const { report, markdownExtras } = await produceReport('local', {
      outputFormat,
      outFile,
      fullTree,
      omitDev,
    })

    // applyDeprecatedCheck's `proceed` return value is intentionally ignored: the
    // deprecated table is advisory output, but gex audit always emits the report.
    await applyDeprecatedCheck(report, {
      checkDeprecated: Boolean(opts.checkDeprecated),
      context: 'local',
      outFile,
    })

    const auditResult = await runAuditWorkflow({
      runAudit: () => npmAudit({ cwd, omitDev }),
      normalize: normalizeNpmAudit as AuditNormalizer,
      failOn,
      outFile,
    })
    attachAuditToReport(report, auditResult)

    if (!outFile) {
      console.log(formatAuditTable(auditResult.vulns, auditResult.summary))
    }

    await outputReport(report, outputFormat, outFile, markdownExtras)

    if (auditResult.shouldFail) {
      process.exitCode = 1
    }
  })

  return auditCmd
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
  createAuditCommand(program)
  createReadCommand(program)

  return program
}
