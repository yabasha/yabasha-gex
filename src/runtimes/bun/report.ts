/**
 * @fileoverview Report generation utilities for Bun CLI
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { buildReportFromNpmTree } from '../../shared/transform.js'
import type { OutputFormat, Report } from '../../shared/types.js'
import { getToolVersion } from '../../shared/cli/utils.js'

import { bunPmLs, bunPmRootGlobal, bunPmRootLocal } from './package-manager.js'

/**
 * Options for Bun report generation
 */
export interface ReportOptions {
  outputFormat: OutputFormat
  outFile?: string
  fullTree?: boolean
  omitDev?: boolean
  cwd?: string
}

/**
 * Result of report generation including markdown extras
 */
export interface ReportResult {
  report: Report
  markdownExtras?: {
    project_description?: string
    project_homepage?: string
    project_bugs?: string
  }
}

/**
 * Produces a dependency report for local or global context using Bun package manager
 *
 * @param ctx - Context for report generation ('local' or 'global')
 * @param options - Report generation options
 * @returns Report and optional markdown extras
 */
export async function produceReport(
  ctx: 'local' | 'global',
  options: ReportOptions,
): Promise<ReportResult> {
  const toolVersion = await getToolVersion()
  const cwd = options.cwd || process.cwd()

  const tree = await bunPmLs({
    global: ctx === 'global',
    omitDev: ctx === 'local' ? Boolean(options.omitDev) : false,
    cwd,
  })
  const nodeModulesPath = tree?.node_modules_path

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
      // Ignore errors reading local package.json (e.g., file missing or invalid JSON)
      void 0
    }
  }

  const resolvedRoot = nodeModulesPath
    ? nodeModulesPath
    : ctx === 'global'
      ? await bunPmRootGlobal().catch(() => undefined)
      : await bunPmRootLocal(cwd).catch(() => `${cwd}/node_modules`)

  const report = await buildReportFromNpmTree(tree, {
    context: ctx,
    includeTree: Boolean(options.fullTree),
    omitDev: Boolean(options.omitDev),
    cwd,
    toolVersion,
    globalRoot: resolvedRoot,
  })

  const markdownExtras = { project_description, project_homepage, project_bugs }
  return { report, markdownExtras }
}
