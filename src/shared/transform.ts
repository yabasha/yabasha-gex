/**
 * @fileoverview Data transformation utilities for converting npm tree data into reports
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'

import type { PackageInfo, Report } from './types.js'

/**
 * Options for report generation and normalization
 */
export type NormalizeOptions = {
  /** Context for report generation ('local' or 'global') */
  context: 'local' | 'global'
  /** Whether to include the full npm dependency tree */
  includeTree?: boolean
  /** Whether to omit devDependencies (local context only) */
  omitDev?: boolean
  /** Current working directory */
  cwd?: string
  /** Tool version to include in report */
  toolVersion: string
  /** Global npm root directory path */
  globalRoot?: string
}

/**
 * Converts npm dependency object to array of package entries
 *
 * @param obj - npm dependency object from npm ls output
 * @returns Array of name/node pairs for packages
 */
function toPkgArray(obj: Record<string, any> | undefined | null): { name: string; node: any }[] {
  if (!obj) return []
  return Object.keys(obj)
    .map((name) => ({ name, node: obj[name] }))
    .filter((p) => p && p.node)
}

/**
 * Builds a GEX report from npm ls tree output
 *
 * @param tree - Raw npm ls command output
 * @param opts - Report generation options
 * @returns Promise resolving to a formatted Report object
 *
 * @example
 * ```typescript
 * import { buildReportFromNpmTree } from './transform.js'
 * import { npmLs } from './npm.js'
 *
 * const tree = await npmLs({ depth0: true })
 * const report = await buildReportFromNpmTree(tree, {
 *   context: 'local',
 *   toolVersion: '0.3.2',
 *   cwd: process.cwd()
 * })
 *
 * console.log(`Found ${report.local_dependencies.length} dependencies`)
 * ```
 */
export async function buildReportFromNpmTree(tree: any, opts: NormalizeOptions): Promise<Report> {
  const timestamp = new Date().toISOString()
  const report: Report = {
    report_version: '1.0',
    timestamp,
    tool_version: opts.toolVersion,
    global_packages: [],
    local_dependencies: [],
    local_dev_dependencies: [],
  }

  if (opts.context === 'local') {
    let pkgMeta: any = null
    try {
      const pkgJsonPath = path.join(opts.cwd || process.cwd(), 'package.json')
      const raw = await readFile(pkgJsonPath, 'utf8')
      pkgMeta = JSON.parse(raw)
    } catch {
      // Ignore errors reading/parsing package.json; fall back to undefined metadata
      void 0
    }
    if (pkgMeta?.name) report.project_name = pkgMeta.name
    if (pkgMeta?.version) report.project_version = pkgMeta.version

    const depsObj = tree?.dependencies as Record<string, any> | undefined
    const devDepsObj = tree?.devDependencies as Record<string, any> | undefined
    const prodItems = toPkgArray(depsObj)
    const treeDevItems = toPkgArray(devDepsObj)

    if (treeDevItems.length > 0) {
      for (const { name, node } of treeDevItems) {
        const version = (node && node.version) || ''
        const resolvedPath =
          (node && node.path) || path.join(opts.cwd || process.cwd(), 'node_modules', name)
        report.local_dev_dependencies.push({ name, version, resolved_path: resolvedPath })
      }
    }

    const devKeys =
      treeDevItems.length > 0
        ? new Set(treeDevItems.map((entry) => entry.name))
        : new Set(Object.keys((pkgMeta?.devDependencies as Record<string, string>) || {}))

    for (const { name, node } of prodItems) {
      const version = (node && node.version) || ''
      const resolvedPath =
        (node && node.path) || path.join(opts.cwd || process.cwd(), 'node_modules', name)
      const pkg: PackageInfo = { name, version, resolved_path: resolvedPath }
      if (!treeDevItems.length && devKeys.has(name)) {
        report.local_dev_dependencies.push(pkg)
      } else {
        report.local_dependencies.push(pkg)
      }
    }

    report.local_dependencies.sort((a, b) => a.name.localeCompare(b.name))
    report.local_dev_dependencies.sort((a, b) => a.name.localeCompare(b.name))
  } else if (opts.context === 'global') {
    const depsObj = tree?.dependencies as Record<string, any> | undefined
    const items = toPkgArray(depsObj)

    for (const { name, node } of items) {
      const version = (node && node.version) || ''
      const resolvedPath = (node && node.path) || path.join(opts.globalRoot || '', name)
      const pkg: PackageInfo = { name, version, resolved_path: resolvedPath }
      report.global_packages.push(pkg)
    }

    report.global_packages.sort((a, b) => a.name.localeCompare(b.name))
  }

  if (opts.includeTree) {
    report.tree = tree
  }

  return report
}
