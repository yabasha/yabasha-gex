import { npmViewDeprecated } from '../npm-cli.js'
import type { Report } from '../types.js'

import { createLoader } from './loader.js'

export type DeprecatedLookupInput = {
  name: string
  version?: string
  type?: string
}

export type DeprecatedEntry = {
  name: string
  version: string
  type: string
  message: string
}

/**
 * Identity of a package whose deprecation status we want to look up.
 * `version` is the *installed* version (from `npm ls` / lockfile / node_modules),
 * which is what the registry should be queried against — querying by name
 * alone returns the latest version's deprecated field and is misleading for
 * pinned projects.
 */
export type DeprecationLookup = {
  name: string
  version: string
}

function lookupKey(lookup: { name: string; version: string }): string {
  return `${lookup.name}@${lookup.version}`
}

export async function fetchDeprecations(
  packages: DeprecationLookup[],
  concurrency = 8,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  const seen = new Set<string>()
  const unique: DeprecationLookup[] = []
  for (const pkg of packages) {
    const key = lookupKey(pkg)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(pkg)
  }
  const limit = Math.max(1, concurrency)

  for (let i = 0; i < unique.length; i += limit) {
    const batch = unique.slice(i, i + limit)
    const settled = await Promise.all(
      batch.map(async (pkg) => {
        try {
          const message = await npmViewDeprecated(pkg.name, pkg.version)
          return [lookupKey(pkg), message] as const
        } catch {
          return [lookupKey(pkg), null] as const
        }
      }),
    )
    for (const [key, message] of settled) {
      result.set(key, message)
    }
  }

  return result
}

export function buildDeprecatedEntries(
  packages: DeprecatedLookupInput[],
  deprecations: Map<string, string | null>,
): DeprecatedEntry[] {
  const seen = new Set<string>()
  const entries: DeprecatedEntry[] = []
  for (const pkg of packages) {
    const message = deprecations.get(`${pkg.name}@${pkg.version || ''}`)
    if (!message) continue
    const key = `${pkg.name}@${pkg.version || ''}|${pkg.type || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      name: pkg.name,
      version: pkg.version || '',
      type: pkg.type || '',
      message,
    })
  }
  return entries
}

export function formatDeprecatedTable(entries: DeprecatedEntry[]): string {
  const headers = ['Name', 'Version', 'Type', 'Reason']
  const rows = entries.map((entry) => [
    entry.name,
    entry.version || '-',
    entry.type || '-',
    entry.message,
  ])

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  )

  const formatRow = (columns: string[]) =>
    columns.map((col, idx) => col.padEnd(widths[idx], ' ')).join('  ')

  const lines = [formatRow(headers), formatRow(widths.map((w) => '-'.repeat(w)))]
  for (const row of rows) {
    lines.push(formatRow(row))
  }
  return lines.join('\n')
}

/**
 * Collects all (name, version) pairs from a report, deduplicated. The same
 * package appearing in multiple sections at the same version is listed once;
 * the same package at different versions across sections is listed twice.
 */
export function collectReportPackages(report: Report): DeprecationLookup[] {
  const seen = new Set<string>()
  const out: DeprecationLookup[] = []
  for (const section of [
    report.global_packages,
    report.local_dependencies,
    report.local_dev_dependencies,
  ]) {
    for (const pkg of section) {
      const lookup = { name: pkg.name, version: pkg.version || '' }
      const key = lookupKey(lookup)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(lookup)
    }
  }
  return out
}

export function attachDeprecatedToReport(
  report: Report,
  deprecations: Map<string, string | null>,
): void {
  const apply = (sections: Report['global_packages'][]): void => {
    for (const section of sections) {
      for (const pkg of section) {
        const key = lookupKey({ name: pkg.name, version: pkg.version || '' })
        if (deprecations.has(key)) {
          pkg.deprecated = deprecations.get(key) ?? null
        }
      }
    }
  }

  apply([report.global_packages, report.local_dependencies, report.local_dev_dependencies])
}

export type DeprecatedWorkflowOptions = {
  checkDeprecated: boolean
  outFile?: string
  fetchDeprecations: () => Promise<Map<string, string | null>>
}

export type DeprecatedWorkflowResult = {
  proceed: boolean
  deprecations: Map<string, string | null>
}

export async function handleDeprecatedWorkflow(
  opts: DeprecatedWorkflowOptions,
): Promise<DeprecatedWorkflowResult> {
  if (!opts.checkDeprecated) {
    return { proceed: true, deprecations: new Map() }
  }

  const loader = createLoader('Checking for deprecated packages')
  const deprecations = await opts.fetchDeprecations()
  loader.stop('Finished checking deprecated packages.')

  const proceed = Boolean(opts.outFile)
  return { proceed, deprecations }
}

export type ApplyDeprecatedCheckOptions = {
  checkDeprecated: boolean
  context: 'local' | 'global'
  outFile: string | undefined
  concurrency?: number
}

export type ApplyDeprecatedCheckResult = {
  proceed: boolean
}

export async function applyDeprecatedCheck(
  report: Report,
  opts: ApplyDeprecatedCheckOptions,
): Promise<ApplyDeprecatedCheckResult> {
  if (!opts.checkDeprecated) return { proceed: true }

  const lookups = collectReportPackages(report)
  const { deprecations } = await handleDeprecatedWorkflow({
    checkDeprecated: true,
    outFile: opts.outFile,
    fetchDeprecations: () => fetchDeprecations(lookups, opts.concurrency),
  })

  attachDeprecatedToReport(report, deprecations)

  const lookup: DeprecatedLookupInput[] =
    opts.context === 'global'
      ? report.global_packages.map((p) => ({ name: p.name, version: p.version, type: 'global' }))
      : [
          ...report.local_dependencies.map((p) => ({
            name: p.name,
            version: p.version,
            type: 'prod',
          })),
          ...report.local_dev_dependencies.map((p) => ({
            name: p.name,
            version: p.version,
            type: 'dev',
          })),
        ]

  const entries = buildDeprecatedEntries(lookup, deprecations)
  if (entries.length === 0) {
    console.log(`No deprecated ${opts.context} packages found.`)
  } else {
    console.log(formatDeprecatedTable(entries))
  }

  return { proceed: Boolean(opts.outFile) }
}
