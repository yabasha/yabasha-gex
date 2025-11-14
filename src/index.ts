/**
 * @fileoverview Library API for GEX - Node.js dependency auditing and reporting tool
 * @version 0.3.2
 */

import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

import { npmLs, npmRootGlobal } from './runtimes/node/package-manager.js'
import { buildReportFromNpmTree } from './shared/transform.js'
import { renderJson } from './shared/report/json.js'
import { renderMarkdown } from './shared/report/md.js'
import { npmRateLimiter, validateFilePath, validateOutputFormat } from './shared/validators.js'
import type { OutputFormat, PackageInfo, Report } from './shared/types.js'

const execFileAsync = promisify(execFile)

export type { Report, PackageInfo, OutputFormat } from './shared/types.js'
export { ValidationError } from './shared/validators.js'

/**
 * Options for generating local dependency reports
 */
export interface LocalReportOptions {
  /** Current working directory (defaults to process.cwd()) */
  cwd?: string
  /** Whether to exclude devDependencies */
  omitDev?: boolean
  /** Whether to use depth=0 for faster execution */
  depth0?: boolean
  /** Whether to include the full npm ls tree in the report */
  includeTree?: boolean
  /** Tool version to include in report metadata */
  toolVersion?: string
}

/**
 * Options for generating global dependency reports
 */
export interface GlobalReportOptions {
  /** Whether to use depth=0 for faster execution */
  depth0?: boolean
  /** Whether to include the full npm ls tree in the report */
  includeTree?: boolean
  /** Tool version to include in report metadata */
  toolVersion?: string
}

/**
 * Options for installing packages from a report
 */
export interface InstallOptions {
  /** Current working directory (defaults to process.cwd()) */
  cwd?: string
  /** Whether to perform a dry run (log commands without executing) */
  dryRun?: boolean
}

/**
 * Generates a dependency report for the local project
 *
 * @param options Configuration options for the report generation
 * @returns Promise that resolves to a Report object
 * @throws {ValidationError} If options are invalid
 * @throws {Error} If npm operations fail
 *
 * @example
 * ```typescript
 * import { generateLocalReport } from '@yabasha/gex'
 *
 * const report = await generateLocalReport({
 *   omitDev: true,
 *   depth0: true
 * })
 *
 * console.log(`Found ${report.local_dependencies.length} dependencies`)
 * ```
 */
export async function generateLocalReport(options: LocalReportOptions = {}): Promise<Report> {
  await npmRateLimiter.throttle()

  const cwd = options.cwd ? validateFilePath(options.cwd) : process.cwd()
  const toolVersion = options.toolVersion || (await getToolVersion())

  const tree = await npmLs({
    global: false,
    omitDev: options.omitDev,
    depth0: options.depth0,
    cwd,
  })

  return buildReportFromNpmTree(tree, {
    context: 'local',
    includeTree: options.includeTree,
    omitDev: options.omitDev,
    cwd,
    toolVersion,
  })
}

/**
 * Generates a dependency report for globally installed packages
 *
 * @param options Configuration options for the report generation
 * @returns Promise that resolves to a Report object
 * @throws {ValidationError} If options are invalid
 * @throws {Error} If npm operations fail
 *
 * @example
 * ```typescript
 * import { generateGlobalReport } from '@yabasha/gex'
 *
 * const report = await generateGlobalReport({ depth0: true })
 * console.log(`Found ${report.global_packages.length} global packages`)
 * ```
 */
export async function generateGlobalReport(options: GlobalReportOptions = {}): Promise<Report> {
  await npmRateLimiter.throttle()

  const toolVersion = options.toolVersion || (await getToolVersion())
  const globalRoot = await npmRootGlobal().catch(() => undefined)

  const tree = await npmLs({
    global: true,
    depth0: options.depth0,
  })

  return buildReportFromNpmTree(tree, {
    context: 'global',
    includeTree: options.includeTree,
    toolVersion,
    globalRoot,
  })
}

/**
 * Formats a report object as a string in the specified format
 *
 * @param report The report object to format
 * @param format The output format ('json' or 'md')
 * @param markdownExtras Additional metadata for markdown formatting
 * @returns Formatted report as a string
 * @throws {ValidationError} If format is invalid
 *
 * @example
 * ```typescript
 * import { generateLocalReport, formatReport } from '@yabasha/gex'
 *
 * const report = await generateLocalReport()
 * const jsonOutput = formatReport(report, 'json')
 * const markdownOutput = formatReport(report, 'md', {
 *   project_description: 'My awesome project'
 * })
 * ```
 */
export function formatReport(
  report: Report,
  format: OutputFormat,
  markdownExtras?: {
    project_description?: string
    project_homepage?: string
    project_bugs?: string
  },
): string {
  const validatedFormat = validateOutputFormat(format)

  if (validatedFormat === 'json') {
    return renderJson(report)
  } else {
    return renderMarkdown({ ...report, ...(markdownExtras || {}) })
  }
}

/**
 * Installs packages listed in a report
 *
 * @param report The report containing packages to install
 * @param options Installation options
 * @returns Promise that resolves when installation is complete
 * @throws {ValidationError} If options are invalid
 * @throws {Error} If npm installation fails
 *
 * @example
 * ```typescript
 * import { parseReportFile, installPackagesFromReport } from '@yabasha/gex'
 *
 * const report = await parseReportFile('./gex-report.json')
 * await installPackagesFromReport(report, { dryRun: true })
 * ```
 */
export async function installPackagesFromReport(
  report: Report,
  options: InstallOptions = {},
): Promise<void> {
  const cwd = options.cwd ? validateFilePath(options.cwd) : process.cwd()

  const globalPkgs = report.global_packages.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const localPkgs = report.local_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const devPkgs = report.local_dev_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)

  if (globalPkgs.length === 0 && localPkgs.length === 0 && devPkgs.length === 0) {
    return
  }

  if (options.dryRun) {
    if (globalPkgs.length > 0) {
      console.log(`[DRY RUN] Would install global: ${globalPkgs.join(' ')}`)
    }
    if (localPkgs.length > 0) {
      console.log(`[DRY RUN] Would install local deps: ${localPkgs.join(' ')}`)
    }
    if (devPkgs.length > 0) {
      console.log(`[DRY RUN] Would install dev deps: ${devPkgs.join(' ')}`)
    }
    return
  }

  if (globalPkgs.length > 0) {
    await npmRateLimiter.throttle()
    await execFileAsync('npm', ['i', '-g', ...globalPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }

  if (localPkgs.length > 0) {
    await npmRateLimiter.throttle()
    await execFileAsync('npm', ['i', ...localPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }

  if (devPkgs.length > 0) {
    await npmRateLimiter.throttle()
    await execFileAsync('npm', ['i', '-D', ...devPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }
}

/**
 * Parses a report file (JSON or Markdown) and returns a Report object
 *
 * @param filePath Path to the report file
 * @returns Promise that resolves to a parsed Report object
 * @throws {ValidationError} If file path is invalid
 * @throws {Error} If file cannot be read or parsed
 *
 * @example
 * ```typescript
 * import { parseReportFile } from '@yabasha/gex'
 *
 * // Parse JSON report
 * const jsonReport = await parseReportFile('./gex-report.json')
 *
 * // Parse Markdown report
 * const mdReport = await parseReportFile('./gex-report.md')
 * ```
 */
export async function parseReportFile(filePath: string): Promise<Report> {
  const validatedPath = validateFilePath(filePath)
  const raw = await readFile(validatedPath, 'utf8')

  if (
    validatedPath.endsWith('.md') ||
    validatedPath.endsWith('.markdown') ||
    raw.startsWith('# GEX Report')
  ) {
    return parseMarkdownReport(raw)
  }

  try {
    return JSON.parse(raw) as Report
  } catch (error) {
    throw new Error(
      `Failed to parse report file as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Gets the current tool version from package.json
 */
async function getToolVersion(): Promise<string> {
  try {
    const pkgPath = getPackageJsonPath()
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * Gets the path to package.json
 */
function getPackageJsonPath(): string {
  try {
    const __filename = import.meta.url.replace('file://', '')
    const __dirname = path.dirname(__filename)
    return path.resolve(__dirname, '..', 'package.json')
  } catch {
    return path.resolve(process.cwd(), 'package.json')
  }
}

/**
 * Parses a markdown report and converts it to a Report object
 * (Simplified version of CLI implementation)
 */
function parseMarkdownReport(md: string): Report {
  const lines = md.split(/\r?\n/)

  const findSection = (title: string) =>
    lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase())

  const parseSection = (idx: number): PackageInfo[] => {
    if (idx < 0) return []

    let i = idx + 1
    while (i < lines.length && !lines[i].trim().startsWith('|')) i++

    return parseMarkdownPackagesTable(lines, i)
  }

  const global_packages = parseSection(findSection('Global Packages'))
  const local_dependencies = parseSection(findSection('Local Dependencies'))
  const local_dev_dependencies = parseSection(findSection('Local Dev Dependencies'))

  return {
    report_version: '1.0',
    timestamp: new Date().toISOString(),
    tool_version: 'unknown',
    global_packages,
    local_dependencies,
    local_dev_dependencies,
  }
}

/**
 * Parses a markdown table and extracts package information
 */
function parseMarkdownPackagesTable(lines: string[], startIndex: number): PackageInfo[] {
  const rows: PackageInfo[] = []
  if (!lines[startIndex] || !lines[startIndex].trim().startsWith('|')) return rows

  let i = startIndex + 2
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cols = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === 0 || idx === arr.length - 1))

    const [name = '', version = '', resolved_path = ''] = cols
    if (name) {
      rows.push({ name, version, resolved_path })
    }
    i++
  }

  return rows
}
