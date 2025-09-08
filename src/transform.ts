import path from 'node:path'
import { readFile } from 'node:fs/promises'

import type { PackageInfo, Report } from './types.js'

export type NormalizeOptions = {
  context: 'local' | 'global'
  includeTree?: boolean
  omitDev?: boolean
  cwd?: string
  toolVersion: string
  globalRoot?: string
}

function toPkgArray(obj: Record<string, any> | undefined | null): { name: string; node: any }[] {
  if (!obj) return []
  return Object.keys(obj)
    .map((name) => ({ name, node: obj[name] }))
    .filter((p) => p && p.node)
}

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
      // ignore; project metadata optional
    }
    if (pkgMeta?.name) report.project_name = pkgMeta.name
    if (pkgMeta?.version) report.project_version = pkgMeta.version

    const depsObj = tree?.dependencies as Record<string, any> | undefined
    const items = toPkgArray(depsObj)
    const devKeys = new Set(Object.keys((pkgMeta?.devDependencies as Record<string, string>) || {}))

    for (const { name, node } of items) {
      const version = (node && node.version) || ''
      const resolvedPath =
        (node && node.path) || path.join(opts.cwd || process.cwd(), 'node_modules', name)
      const pkg: PackageInfo = { name, version, resolved_path: resolvedPath }
      if (devKeys.has(name)) {
        // Only categorize as dev if present in the tree; with --omit-dev they won't appear
        report.local_dev_dependencies.push(pkg)
      } else {
        report.local_dependencies.push(pkg)
      }
    }

    // sort
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
