import path from 'node:path'

import { Command } from 'commander'

import { diffReports, formatDiffMarkdown, formatDiffSummary } from './diff.js'
import { loadReportFromFile } from './parser.js'

type DiffFormat = 'md' | 'json'

export function createDiffCommand(program: Command): Command {
  const diffCmd = program
    .command('diff')
    .description('Compare two GEX reports and show added/removed/upgraded/downgraded packages')
    .argument('<old>', 'Path to the older report (JSON or Markdown)')
    .argument('<new>', 'Path to the newer report (JSON or Markdown)')
    .option(
      '-f, --output-format <format>',
      'Output format: md or json',
      (val) => (val === 'json' ? 'json' : 'md'),
      'md',
    )
    .option('-o, --out-file <path>', 'Write diff to file')
    .option('--fail-on-changes', 'Exit non-zero if any changes are detected', false)

  diffCmd.action(async (oldArg: string, newArg: string, opts: any) => {
    const cwd = process.cwd()
    const oldPath = path.resolve(cwd, oldArg)
    const newPath = path.resolve(cwd, newArg)

    let oldReport
    let newReport
    try {
      oldReport = await loadReportFromFile(oldPath)
    } catch (err: any) {
      console.error(`Failed to read report at ${oldPath}: ${err?.message || err}`)
      process.exitCode = 1
      return
    }
    try {
      newReport = await loadReportFromFile(newPath)
    } catch (err: any) {
      console.error(`Failed to read report at ${newPath}: ${err?.message || err}`)
      process.exitCode = 1
      return
    }

    const diff = diffReports(oldReport, newReport)
    const format = (opts.outputFormat ?? 'md') as DiffFormat
    const outFile = opts.outFile as string | undefined

    const content = format === 'json' ? JSON.stringify(diff, null, 2) : formatDiffMarkdown(diff)

    if (outFile) {
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(path.dirname(outFile), { recursive: true })
      await writeFile(outFile, content, 'utf8')
      console.log(`Wrote diff to ${outFile}`)
      console.log(formatDiffSummary(diff))
    } else {
      console.log(content)
    }

    if (opts.failOnChanges) {
      const { added, removed, upgraded, downgraded } = diff.totals
      if (added + removed + upgraded + downgraded > 0) {
        process.exitCode = 1
      }
    }
  })

  return diffCmd
}
