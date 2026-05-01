/**
 * @fileoverview Report generation utilities for Bun CLI
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { buildReportFromNpmTree } from '../../shared/transform.js'
import { parseBunLockfile, parsePackageLockJson } from '../../shared/lockfile.js'
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
  fromLockfile?: boolean
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

  let tree: any
  let nodeModulesPath: string | undefined
  if (options.fromLockfile) {
    if (ctx === 'global') {
      throw new Error(
        '--from-lockfile is not supported for global packages (no lockfile available)',
      )
    }
    tree = await readBunLockfileTree(cwd)
  } else {
    tree = await bunPmLs({
      global: ctx === 'global',
      omitDev: ctx === 'local' ? Boolean(options.omitDev) : false,
      cwd,
    })
    nodeModulesPath = tree?.node_modules_path
  }

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

  let resolvedRoot: string | undefined
  if (options.fromLockfile) {
    resolvedRoot = `${cwd}/node_modules`
  } else if (nodeModulesPath) {
    resolvedRoot = nodeModulesPath
  } else if (ctx === 'global') {
    resolvedRoot = await bunPmRootGlobal().catch(() => undefined)
  } else {
    resolvedRoot = await bunPmRootLocal(cwd).catch(() => `${cwd}/node_modules`)
  }

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

async function readBunLockfileTree(cwd: string): Promise<any> {
  const bunLockPath = path.join(cwd, 'bun.lock')
  try {
    const raw = await readFile(bunLockPath, 'utf8')
    return parseBunLockfile(raw, { cwd })
  } catch {
    // fall through to package-lock.json
  }
  const npmLockPath = path.join(cwd, 'package-lock.json')
  try {
    const raw = await readFile(npmLockPath, 'utf8')
    return parsePackageLockJson(raw, { cwd })
  } catch {
    throw new Error(
      `No lockfile found at ${bunLockPath} or ${npmLockPath} (--from-lockfile requires bun.lock or package-lock.json)`,
    )
  }
}
