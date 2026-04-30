/**
 * @fileoverview Report generation utilities for the pnpm runtime.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { buildReportFromNpmTree } from '../../shared/transform.js'
import type { OutputFormat, Report } from '../../shared/types.js'
import { getToolVersion } from '../../shared/cli/utils.js'

import { pnpmPmLs, pnpmRootGlobal } from './package-manager.js'

export interface ReportOptions {
  outputFormat: OutputFormat
  outFile?: string
  fullTree?: boolean
  omitDev?: boolean
  cwd?: string
}

export interface ReportResult {
  report: Report
  markdownExtras?: {
    project_description?: string
    project_homepage?: string
    project_bugs?: string
  }
}

export async function produceReport(
  ctx: 'local' | 'global',
  options: ReportOptions,
): Promise<ReportResult> {
  const toolVersion = await getToolVersion()
  const cwd = options.cwd || process.cwd()

  const tree = await pnpmPmLs({
    global: ctx === 'global',
    omitDev: ctx === 'local' ? Boolean(options.omitDev) : false,
    cwd,
  })

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
      void 0
    }
  }

  const globalRoot =
    ctx === 'global'
      ? tree.node_modules_path || (await pnpmRootGlobal().catch(() => undefined))
      : undefined

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
