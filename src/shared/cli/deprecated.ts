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

export async function fetchDeprecations(
  names: string[],
  concurrency = 8,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  const unique = Array.from(new Set(names))
  const limit = Math.max(1, concurrency)

  for (let i = 0; i < unique.length; i += limit) {
    const batch = unique.slice(i, i + limit)
    const settled = await Promise.all(
      batch.map(async (name) => {
        try {
          const message = await npmViewDeprecated(name)
          return [name, message] as const
        } catch {
          return [name, null] as const
        }
      }),
    )
    for (const [name, message] of settled) {
      result.set(name, message)
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
    const message = deprecations.get(pkg.name)
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

export function collectReportPackageNames(report: Report): string[] {
  const names = new Set<string>()
  for (const pkg of report.global_packages) names.add(pkg.name)
  for (const pkg of report.local_dependencies) names.add(pkg.name)
  for (const pkg of report.local_dev_dependencies) names.add(pkg.name)
  return Array.from(names)
}

export function attachDeprecatedToReport(
  report: Report,
  deprecations: Map<string, string | null>,
): void {
  const apply = (sections: Report['global_packages'][]): void => {
    for (const section of sections) {
      for (const pkg of section) {
        if (deprecations.has(pkg.name)) {
          pkg.deprecated = deprecations.get(pkg.name) ?? null
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

  const names = collectReportPackageNames(report)
  const { deprecations } = await handleDeprecatedWorkflow({
    checkDeprecated: true,
    outFile: opts.outFile,
    fetchDeprecations: () => fetchDeprecations(names, opts.concurrency),
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
