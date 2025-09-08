import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { Command } from 'commander'

import { npmLs, npmRootGlobal } from './npm.js'
import { buildReportFromNpmTree } from './transform.js'
import { renderJson } from './report/json.js'
import { renderMarkdown } from './report/md.js'
import type { OutputFormat, Report } from './types.js'

function getPkgJsonPath(): string {
  // Resolve package.json relative to this file for both ESM and CJS bundles
  try {
    const __filename = fileURLToPath((import.meta as any).url)
    const __dirnameLocal = path.dirname(__filename)
    return path.resolve(__dirnameLocal, '..', 'package.json')
  } catch {
    const dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd()
    return path.resolve(dir, '..', 'package.json')
  }
}

async function getToolVersion(): Promise<string> {
  try {
    const pkgPath = getPkgJsonPath()
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const execFileAsync = promisify(execFile)

const ASCII_BANNER = String.raw`
  ________                __
 /  _____/  ____   _____/  |_  ____   ____ 
/   \  ___ /  _ \ /  _ \   __\/ __ \ /    \
\    \_\  (  <_> |  <_> )  | \  ___/|   |  \
 \______  /\____/ \____/|__|  \___  >___|  /
        \/                         \/     \/ 
                      GEX
`

async function produceReport(
  ctx: 'local' | 'global',
  options: {
    outputFormat: OutputFormat
    outFile?: string
    fullTree?: boolean
    omitDev?: boolean
    cwd?: string
  },
): Promise<{ report: Report; markdownExtras?: any }> {
  const toolVersion = await getToolVersion()
  const depth0 = !options.fullTree
  const cwd = options.cwd || process.cwd()

  const tree = await npmLs({
    global: ctx === 'global',
    omitDev: ctx === 'local' ? Boolean(options.omitDev) : false,
    depth0,
    cwd,
  })

  // Get extra metadata for markdown rendering when local
  let project_description: string | undefined
  let project_homepage: string | undefined
  let project_bugs: string | undefined
  if (ctx === 'local') {
    try {
      const pkgRaw = await readFile(path.join(cwd, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw)
      project_description = pkg.description
      project_homepage = pkg.homepage
      if (typeof pkg.bugs === 'string') project_bugs = pkg.bugs
      else if (pkg.bugs && typeof pkg.bugs.url === 'string') project_bugs = pkg.bugs.url
    } catch {
      // ignore
    }
  }

  const globalRoot = ctx === 'global' ? await npmRootGlobal().catch(() => undefined) : undefined

  const report = await buildReportFromNpmTree(tree, {
    context: ctx,
    includeTree: Boolean(options.fullTree),
    omitDev: Boolean(options.omitDev),
    cwd,
    toolVersion,
    globalRoot,
  })

  const markdownExtras = { project_description, project_homepage, project_bugs }
  return { report, markdownExtras }
}

function printFromReport(report: Report) {
  const lines: string[] = []
  if (report.global_packages.length > 0) {
    lines.push('Global Packages:')
    for (const p of report.global_packages) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }
  if (report.local_dependencies.length > 0) {
    if (lines.length) lines.push('')
    lines.push('Local Dependencies:')
    for (const p of report.local_dependencies) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }
  if (report.local_dev_dependencies.length > 0) {
    if (lines.length) lines.push('')
    lines.push('Local Dev Dependencies:')
    for (const p of report.local_dev_dependencies) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }
  if (lines.length === 0) {
    lines.push('(no packages found in report)')
  }
  console.log(lines.join('\n'))
}

async function installFromReport(report: Report, cwd: string) {
  const globalPkgs = report.global_packages.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const localPkgs = report.local_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const devPkgs = report.local_dev_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)

  if (globalPkgs.length === 0 && localPkgs.length === 0 && devPkgs.length === 0) {
    console.log('No packages to install from report.')
    return
  }

  if (globalPkgs.length > 0) {
    console.log(`Installing global: ${globalPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', '-g', ...globalPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }
  if (localPkgs.length > 0) {
    console.log(`Installing local deps: ${localPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', ...localPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }
  if (devPkgs.length > 0) {
    console.log(`Installing local devDeps: ${devPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', '-D', ...devPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }
}

async function outputReport(
  report: Report,
  format: OutputFormat,
  outFile?: string,
  markdownExtras?: any,
) {
  const content =
    format === 'json'
      ? renderJson(report)
      : renderMarkdown({ ...report, ...(markdownExtras || {}) })
  if (outFile) {
    const outDir = path.dirname(outFile)
    await (await import('node:fs/promises')).mkdir(outDir, { recursive: true })
    await (await import('node:fs/promises')).writeFile(outFile, content, 'utf8')

    console.log(`Wrote report to ${outFile}`)
  } else {
    console.log(content)
  }
}

export async function run(argv = process.argv) {
  const program = new Command()
    .name('gex')
    .description('GEX: Dependency auditing and documentation for Node.js (local and global).')
    .version(await getToolVersion())

  program.addHelpText('beforeAll', `\n${ASCII_BANNER}`)

  const addCommonOptions = (cmd: Command, { allowOmitDev }: { allowOmitDev: boolean }) => {
    cmd
      .option(
        '-f, --output-format <format>',
        'Output format: md or json',
        (val) => (val === 'md' ? 'md' : 'json'),
        'json',
      )
      .option('-o, --out-file <path>', 'Write report to file')
      .option('--full-tree', 'Include full npm ls tree (omit depth=0 default)', false)
    if (allowOmitDev) {
      cmd.option('--omit-dev', 'Exclude devDependencies (local only)', false)
    }
    return cmd
  }

  // gex local (default command)
  const localCmd = program
    .command('local', { isDefault: true })
    .description("Generate a report for the current project's dependencies")
  addCommonOptions(localCmd, { allowOmitDev: true })
  localCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)
    const omitDev = Boolean(opts.omitDev)

    let finalOutFile = outFile
    if (!outFile && opts.outputFormat && typeof opts.outputFormat === 'string') {
      finalOutFile = `gex-report.${outputFormat}`
    }

    const { report, markdownExtras } = await produceReport('local', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
      omitDev,
    })
    await outputReport(report, outputFormat, finalOutFile, markdownExtras)
  })

  // gex global
  const globalCmd = program
    .command('global')
    .description('Generate a report of globally installed packages')
  addCommonOptions(globalCmd, { allowOmitDev: false })
  globalCmd.action(async (opts) => {
    const outputFormat = (opts.outputFormat ?? 'json') as OutputFormat
    const outFile = opts.outFile as string | undefined
    const fullTree = Boolean(opts.fullTree)

    let finalOutFile = outFile
    if (!outFile && opts.outputFormat && typeof opts.outputFormat === 'string') {
      finalOutFile = `gex-report.${outputFormat}`
    }

    const { report, markdownExtras } = await produceReport('global', {
      outputFormat,
      outFile: finalOutFile,
      fullTree,
    })
    await outputReport(report, outputFormat, finalOutFile, markdownExtras)
  })

  // gex read (consume a previous JSON report)
  const readCmd = program
    .command('read')
    .description(
      'Read a previously generated JSON report and either print package names or install them',
    )
    .option('-r, --report <path>', 'Path to report JSON', 'gex-report.json')
    .option('-p, --print', 'Print package names/versions from the report (default)', false)
    .option('-i, --install', 'Install packages from the report', false)
  readCmd.action(async (opts) => {
    const reportPath = path.resolve(process.cwd(), opts.report as string)
    const raw = await readFile(reportPath, 'utf8')
    const parsed = JSON.parse(raw) as Report

    // default behavior: print if --install not provided
    const doInstall = Boolean(opts.install)
    const doPrint = Boolean(opts.print) || !doInstall

    if (doPrint) {
      printFromReport(parsed)
    }
    if (doInstall) {
      await installFromReport(parsed, process.cwd())
    }
  })

  await program.parseAsync(argv)
}

const isCjsMain = typeof require !== 'undefined' && (require as any).main === module
const isEsmMain =
  typeof import.meta !== 'undefined' && (import.meta as any).url === `file://${process.argv[1]}`
if (isCjsMain || isEsmMain) {
  run()
}
