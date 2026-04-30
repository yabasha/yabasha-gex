import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { PackageInfo, Report } from '../types.js'

export const UNKNOWN_LICENSE = 'UNKNOWN'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickLegacyType(entry: unknown): string | null {
  if (typeof entry === 'string' && entry.trim()) return entry.trim()
  if (isPlainObject(entry) && typeof entry.type === 'string' && entry.type.trim()) {
    return entry.type.trim()
  }
  return null
}

export function parseLicenseField(pkg: unknown): string {
  if (!isPlainObject(pkg)) return UNKNOWN_LICENSE

  const license = pkg.license
  if (typeof license === 'string' && license.trim()) return license.trim()

  if (isPlainObject(license)) {
    const legacy = pickLegacyType(license)
    if (legacy) return legacy
  }

  const licenses = pkg.licenses
  if (Array.isArray(licenses) && licenses.length > 0) {
    const types = licenses.map(pickLegacyType).filter((v): v is string => Boolean(v))
    if (types.length === 1) return types[0]
    if (types.length > 1) return `(${types.join(' OR ')})`
  }

  return UNKNOWN_LICENSE
}

export function normalizeLicense(license: string): string {
  return license
    .trim()
    .replace(/^\(|\)$/g, '')
    .toLowerCase()
}

export function splitSpdxExpression(license: string): string[] {
  const inner = license.trim().replace(/^\(|\)$/g, '')
  const parts = inner
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [license]
}

async function readPackageManifest(resolvedPath: string): Promise<unknown | null> {
  if (!resolvedPath) return null
  const manifestPath = path.join(resolvedPath, 'package.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function enrichSection(packages: PackageInfo[]): Promise<PackageInfo[]> {
  return Promise.all(
    packages.map(async (pkg) => {
      const manifest = await readPackageManifest(pkg.resolved_path)
      const license = parseLicenseField(manifest)
      return { ...pkg, license }
    }),
  )
}

export async function enrichReportWithLicenses(report: Report): Promise<Report> {
  const [global_packages, local_dependencies, local_dev_dependencies] = await Promise.all([
    enrichSection(report.global_packages),
    enrichSection(report.local_dependencies),
    enrichSection(report.local_dev_dependencies),
  ])

  return {
    ...report,
    global_packages,
    local_dependencies,
    local_dev_dependencies,
  }
}

export type LicenseViolation = {
  name: string
  version: string
  license: string
  section: 'dependencies' | 'devDependencies' | 'global'
}

function isLicenseAllowed(license: string, allowSet: Set<string>): boolean {
  const trimmed = license.trim()
  if (!trimmed) return false
  if (normalizeLicense(trimmed) === 'unknown') return false

  const isStrict = /\s+AND\s+/i.test(trimmed)
  const parts = splitSpdxExpression(trimmed).map((p) => normalizeLicense(p))
  if (isStrict) return parts.every((p) => allowSet.has(p))
  return parts.some((p) => allowSet.has(p))
}

export function findLicenseViolations(report: Report, allowlist: string[]): LicenseViolation[] {
  const allowSet = new Set(allowlist.map((entry) => normalizeLicense(entry)))
  const violations: LicenseViolation[] = []

  const checkSection = (packages: PackageInfo[], section: LicenseViolation['section']) => {
    for (const pkg of packages) {
      const license = pkg.license ?? UNKNOWN_LICENSE
      if (!isLicenseAllowed(license, allowSet)) {
        violations.push({
          name: pkg.name,
          version: pkg.version,
          license,
          section,
        })
      }
    }
  }

  checkSection(report.global_packages, 'global')
  checkSection(report.local_dependencies, 'dependencies')
  checkSection(report.local_dev_dependencies, 'devDependencies')

  return violations
}

export function formatLicenseViolations(violations: LicenseViolation[]): string {
  if (violations.length === 0) return 'No license violations'
  const headers = ['Package', 'Version', 'License', 'Section']
  const rows = violations.map((v) => [v.name, v.version, v.license, v.section])
  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => row[idx].length)),
  )
  const formatRow = (cols: string[]) =>
    cols.map((col, idx) => col.padEnd(widths[idx], ' ')).join('  ')
  const lines = [formatRow(headers), formatRow(widths.map((w) => '-'.repeat(w)))]
  for (const row of rows) lines.push(formatRow(row))
  return lines.join('\n')
}
