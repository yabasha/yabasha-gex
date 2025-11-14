import type { OutdatedInfo } from '../npm-cli.js'
import { npmViewVersion } from '../npm-cli.js'
import { createLoader } from './loader.js'

export type OutdatedEntry = OutdatedInfo

export type OutdatedSelection = {
  shouldUpdate: boolean
  updateAll: boolean
  packages: string[]
}

export function normalizeUpdateSelection(value: unknown): OutdatedSelection {
  if (value === undefined) {
    return { shouldUpdate: false, updateAll: false, packages: [] }
  }
  if (value === true) {
    return { shouldUpdate: true, updateAll: true, packages: [] }
  }
  const packages = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const normalized = packages
    .flatMap((entry) => String(entry).split(',').map((part) => part.trim()))
    .filter(Boolean)

  return {
    shouldUpdate: true,
    updateAll: false,
    packages: normalized,
  }
}

export function formatOutdatedTable(entries: OutdatedEntry[]): string {
  const headers = ['Name', 'Current', 'Wanted', 'Latest', 'Type']
  const rows = entries.map((entry) => [
    entry.name,
    entry.current || '-',
    entry.wanted || '-',
    entry.latest || '-',
    entry.type || '-',
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

export type OutdatedWorkflowOptions = {
  checkOutdated: boolean
  selection: OutdatedSelection
  contextLabel: 'local' | 'global'
  outFile?: string
  fetchOutdated: () => Promise<OutdatedEntry[]>
  updateRunner?: (packages: string[]) => Promise<void>
}

export async function handleOutdatedWorkflow(opts: OutdatedWorkflowOptions): Promise<boolean> {
  if (!opts.checkOutdated && !opts.selection.shouldUpdate) {
    return true
  }

  let fetchLoader: ReturnType<typeof createLoader> | undefined
  if (opts.checkOutdated || opts.selection.shouldUpdate) {
    fetchLoader = createLoader('Checking for outdated packages')
  }
  const outdated = await opts.fetchOutdated()
  fetchLoader?.stop('Finished checking outdated packages.')

  if (opts.checkOutdated) {
    if (outdated.length === 0) {
      console.log(`All ${opts.contextLabel} packages are up to date.`)
    } else {
      console.log(formatOutdatedTable(outdated))
    }
  }

  if (opts.selection.shouldUpdate && opts.updateRunner) {
    const packagesToUpdate = opts.selection.updateAll
      ? outdated.map((entry) => entry.name)
      : opts.selection.packages

    if (!packagesToUpdate || packagesToUpdate.length === 0) {
      if (opts.selection.updateAll) {
        console.log('No outdated packages to update.')
      } else {
        console.log('No packages were specified for updating.')
      }
    } else {
      const updateLoader = createLoader('Updating packages')
      await opts.updateRunner(packagesToUpdate)
      updateLoader.stop('Finished updating packages.')
    }
  }

  if (opts.checkOutdated || opts.selection.shouldUpdate) {
    if (!opts.outFile) {
      return false
    }
  }

  return true
}

export type InstalledPackageInput = {
  name: string
  current: string
  declared?: string
  type?: string
}

export async function resolveOutdatedWithNpmView(
  packages: InstalledPackageInput[],
): Promise<OutdatedEntry[]> {
  const results: OutdatedEntry[] = []
  for (const pkg of packages) {
    try {
      const latest = await npmViewVersion(pkg.name)
      if (latest && pkg.current && latest !== pkg.current) {
        results.push({
          name: pkg.name,
          current: pkg.current,
          wanted: pkg.declared || latest,
          latest,
          type: pkg.type,
        })
      }
    } catch {
      continue
    }
  }
  return results
}
