import type { PackageInfo, Report } from '../types.js'

export type PackageChange = {
  name: string
  from: string
  to: string
}

export type SectionDiff = {
  added: PackageInfo[]
  removed: PackageInfo[]
  upgraded: PackageChange[]
  downgraded: PackageChange[]
}

export type ReportDiff = {
  global_packages: SectionDiff
  local_dependencies: SectionDiff
  local_dev_dependencies: SectionDiff
  totals: {
    added: number
    removed: number
    upgraded: number
    downgraded: number
  }
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseSemver(version: string): [number, number, number, string] | null {
  const match = SEMVER_RE.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? '']
}

function compareIdentifier(a: string, b: string): number {
  const aNum = /^\d+$/.test(a) ? Number(a) : null
  const bNum = /^\d+$/.test(b) ? Number(b) : null
  if (aNum !== null && bNum !== null) return aNum - bNum
  if (aNum !== null) return -1
  if (bNum !== null) return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function comparePrerelease(a: string, b: string): number {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  const aParts = a.split('.')
  const bParts = b.split('.')
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const ap = aParts[i]
    const bp = bParts[i]
    if (ap === undefined) return -1
    if (bp === undefined) return 1
    const cmp = compareIdentifier(ap, bp)
    if (cmp !== 0) return cmp
  }
  return 0
}

export function compareVersions(a: string, b: string): number {
  if (a === b) return 0
  const aSv = parseSemver(a)
  const bSv = parseSemver(b)
  if (aSv && bSv) {
    for (let i = 0; i < 3; i += 1) {
      if (aSv[i] !== bSv[i]) return (aSv[i] as number) - (bSv[i] as number)
    }
    return comparePrerelease(aSv[3], bSv[3])
  }
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function diffSection(oldList: PackageInfo[], newList: PackageInfo[]): SectionDiff {
  const oldByName = new Map(oldList.map((p) => [p.name, p]))
  const newByName = new Map(newList.map((p) => [p.name, p]))

  const added: PackageInfo[] = []
  const removed: PackageInfo[] = []
  const upgraded: PackageChange[] = []
  const downgraded: PackageChange[] = []

  for (const [name, pkg] of newByName) {
    const prev = oldByName.get(name)
    if (!prev) {
      added.push(pkg)
      continue
    }
    if (prev.version === pkg.version) continue
    const cmp = compareVersions(prev.version, pkg.version)
    if (cmp < 0) upgraded.push({ name, from: prev.version, to: pkg.version })
    else if (cmp > 0) downgraded.push({ name, from: prev.version, to: pkg.version })
  }

  for (const [name, pkg] of oldByName) {
    if (!newByName.has(name)) removed.push(pkg)
  }

  added.sort((a, b) => a.name.localeCompare(b.name))
  removed.sort((a, b) => a.name.localeCompare(b.name))
  upgraded.sort((a, b) => a.name.localeCompare(b.name))
  downgraded.sort((a, b) => a.name.localeCompare(b.name))

  return { added, removed, upgraded, downgraded }
}

function isEmptySection(section: SectionDiff): boolean {
  return (
    section.added.length === 0 &&
    section.removed.length === 0 &&
    section.upgraded.length === 0 &&
    section.downgraded.length === 0
  )
}

function mdTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
  return [header, sep, body].filter(Boolean).join('\n')
}

function renderSection(title: string, section: SectionDiff): string[] {
  if (isEmptySection(section)) return []

  const lines: string[] = []
  lines.push(`## ${title}`)
  lines.push('')

  if (section.added.length > 0) {
    lines.push('### Added')
    lines.push(
      mdTable(
        ['Name', 'Version'],
        section.added.map((p) => [p.name, p.version || '']),
      ),
    )
    lines.push('')
  }

  if (section.removed.length > 0) {
    lines.push('### Removed')
    lines.push(
      mdTable(
        ['Name', 'Version'],
        section.removed.map((p) => [p.name, p.version || '']),
      ),
    )
    lines.push('')
  }

  if (section.upgraded.length > 0) {
    lines.push('### Upgraded')
    lines.push(
      mdTable(
        ['Name', 'From', 'To'],
        section.upgraded.map((c) => [c.name, c.from, c.to]),
      ),
    )
    lines.push('')
  }

  if (section.downgraded.length > 0) {
    lines.push('### Downgraded')
    lines.push(
      mdTable(
        ['Name', 'From', 'To'],
        section.downgraded.map((c) => [c.name, c.from, c.to]),
      ),
    )
    lines.push('')
  }

  return lines
}

export function formatDiffSummary(diff: ReportDiff): string {
  const { added, removed, upgraded, downgraded } = diff.totals
  if (added === 0 && removed === 0 && upgraded === 0 && downgraded === 0) {
    return 'No changes'
  }
  return `${added} added, ${removed} removed, ${upgraded} upgraded, ${downgraded} downgraded`
}

export function formatDiffMarkdown(diff: ReportDiff): string {
  const lines: string[] = []
  lines.push('# GEX Report Diff')
  lines.push('')
  lines.push(formatDiffSummary(diff))
  lines.push('')

  const { added, removed, upgraded, downgraded } = diff.totals
  if (added === 0 && removed === 0 && upgraded === 0 && downgraded === 0) {
    lines.push('_No changes_')
    return lines.join('\n')
  }

  lines.push(...renderSection('Global Packages', diff.global_packages))
  lines.push(...renderSection('Local Dependencies', diff.local_dependencies))
  lines.push(...renderSection('Local Dev Dependencies', diff.local_dev_dependencies))

  return lines.join('\n').trimEnd()
}

export function diffReports(oldReport: Report, newReport: Report): ReportDiff {
  const global_packages = diffSection(oldReport.global_packages, newReport.global_packages)
  const local_dependencies = diffSection(oldReport.local_dependencies, newReport.local_dependencies)
  const local_dev_dependencies = diffSection(
    oldReport.local_dev_dependencies,
    newReport.local_dev_dependencies,
  )

  const sections = [global_packages, local_dependencies, local_dev_dependencies]
  const totals = {
    added: sections.reduce((sum, s) => sum + s.added.length, 0),
    removed: sections.reduce((sum, s) => sum + s.removed.length, 0),
    upgraded: sections.reduce((sum, s) => sum + s.upgraded.length, 0),
    downgraded: sections.reduce((sum, s) => sum + s.downgraded.length, 0),
  }

  return { global_packages, local_dependencies, local_dev_dependencies, totals }
}
