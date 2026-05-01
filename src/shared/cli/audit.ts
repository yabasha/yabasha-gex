import type { AuditSummary, Report, Severity, Vulnerability } from '../types.js'
import type { NpmAuditRaw } from '../npm-cli.js'
import type { BunAuditRaw } from '../../runtimes/bun/package-manager.js'

const SEVERITIES: Severity[] = ['info', 'low', 'moderate', 'high', 'critical']

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
}

function emptyCounts(): Record<Severity, number> {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.length > 0) return error
  return 'audit failed'
}

function coerceSeverity(value: unknown): Severity {
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (
      lower === 'info' ||
      lower === 'low' ||
      lower === 'moderate' ||
      lower === 'high' ||
      lower === 'critical'
    ) {
      return lower
    }
  }
  return 'info'
}

export function severityAtOrAbove(counts: Record<Severity, number>, threshold: Severity): number {
  const min = SEVERITY_RANK[threshold]
  let total = 0
  for (const sev of SEVERITIES) {
    if (SEVERITY_RANK[sev] >= min) total += counts[sev]
  }
  return total
}

export type NormalizedAudit = {
  summary: AuditSummary
  vulns: Vulnerability[]
}

export function normalizeNpmAudit(raw: NpmAuditRaw): NormalizedAudit {
  const counts = emptyCounts()
  const vulns: Vulnerability[] = []
  const seen = new Set<string>()

  const vulnerabilities = raw.vulnerabilities || {}
  for (const [pkgName, node] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(node.via) ? node.via : []
    for (const entry of via) {
      if (typeof entry !== 'object' || entry === null) continue

      const id =
        entry.source != null
          ? String(entry.source)
          : `${pkgName}-${entry.title || ''}-${entry.url || ''}-${entry.range || ''}`
      const dedupKey = `${pkgName}|${id}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      const severity = coerceSeverity(entry.severity || node.severity)
      vulns.push({
        id,
        package: entry.name || pkgName,
        severity,
        range: entry.range || node.range || '',
        title: entry.title || '',
        url: entry.url || '',
      })
    }
  }

  for (const v of vulns) counts[v.severity] += 1

  const dependencies = npmDependenciesBlock(raw.metadata?.dependencies)
  const summary: AuditSummary = {
    counts,
    total: vulns.length,
    ...(dependencies ? { dependencies } : {}),
  }
  return { summary, vulns }
}

function npmDependenciesBlock(
  raw: NonNullable<NpmAuditRaw['metadata']>['dependencies'] | undefined,
): AuditSummary['dependencies'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const get = (k: keyof typeof raw): number => (typeof raw[k] === 'number' ? (raw[k] as number) : 0)
  return {
    prod: get('prod'),
    dev: get('dev'),
    optional: get('optional'),
    peer: get('peer'),
    peerOptional: get('peerOptional'),
    total: get('total'),
  }
}

export function normalizeBunAudit(raw: BunAuditRaw): NormalizedAudit {
  const counts = emptyCounts()
  const vulns: Vulnerability[] = []
  const seen = new Set<string>()

  for (const [pkgName, advisories] of Object.entries(raw)) {
    if (!Array.isArray(advisories)) continue
    for (const adv of advisories) {
      const ghsa = typeof adv.github_advisory_id === 'string' ? adv.github_advisory_id : undefined
      const id =
        ghsa ||
        (adv.id != null
          ? String(adv.id)
          : `${pkgName}-${adv.title || ''}-${adv.url || ''}-${adv.vulnerable_versions || ''}`)
      const dedupKey = `${pkgName}|${id}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      const severity = coerceSeverity(adv.severity)
      const cve =
        Array.isArray(adv.cves) && typeof adv.cves[0] === 'string' ? adv.cves[0] : undefined
      const vuln: Vulnerability = {
        id,
        package: adv.module_name || pkgName,
        severity,
        range: adv.vulnerable_versions || '',
        title: adv.title || '',
        url: adv.url || '',
        ...(ghsa ? { ghsa } : {}),
        ...(cve ? { cve } : {}),
      }
      vulns.push(vuln)
    }
  }

  for (const v of vulns) counts[v.severity] += 1
  return { summary: { counts, total: vulns.length }, vulns }
}

export type AuditNormalizer = (raw: unknown) => NormalizedAudit

export type AuditWorkflowOptions = {
  runAudit: () => Promise<unknown>
  normalize: AuditNormalizer
  failOn?: Severity
  /** Caller context only — not consumed here; CLI commands pass it through alongside the workflow result. */
  outFile?: string
}

export type AuditWorkflowResult = {
  summary: AuditSummary
  vulns: Vulnerability[]
  shouldFail: boolean
}

export async function runAuditWorkflow(opts: AuditWorkflowOptions): Promise<AuditWorkflowResult> {
  let summary: AuditSummary
  let vulns: Vulnerability[]

  try {
    const raw = await opts.runAudit()
    const normalized = opts.normalize(raw)
    summary = normalized.summary
    vulns = normalized.vulns
  } catch (error: unknown) {
    summary = {
      counts: emptyCounts(),
      total: 0,
      error: extractErrorMessage(error),
    }
    vulns = []
  }

  let shouldFail = false
  if (opts.failOn) {
    if (summary.error) {
      shouldFail = true
    } else {
      shouldFail = severityAtOrAbove(summary.counts, opts.failOn) > 0
    }
  }

  return { summary, vulns, shouldFail }
}

export function parseFailOn(value: unknown): Severity | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (lower === 'low' || lower === 'moderate' || lower === 'high' || lower === 'critical') {
      return lower
    }
  }
  throw new Error(
    `Invalid --fail-on value: ${String(value)} (must be one of low|moderate|high|critical)`,
  )
}

export function attachAuditToReport(report: Report, result: NormalizedAudit): void {
  report.audit_summary = result.summary
  report.vulnerabilities = result.vulns
}

export function formatAuditTable(vulns: Vulnerability[], summary: AuditSummary): string {
  if (summary.error) {
    return `Audit failed: ${summary.error}`
  }

  const lines: string[] = [formatAuditCounts(summary)]

  if (vulns.length === 0) {
    lines.push('No vulnerabilities found.')
    return lines.join('\n')
  }

  lines.push('')

  const sorted = [...vulns].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  const headers = ['Package', 'Severity', 'Range', 'ID', 'Title']
  const rows = sorted.map((v) => [v.package, v.severity, v.range || '-', v.id, v.title || '-'])

  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => row[idx].length)),
  )

  const formatRow = (cols: string[]) =>
    cols.map((col, idx) => col.padEnd(widths[idx], ' ')).join('  ')

  lines.push(formatRow(headers))
  lines.push(formatRow(widths.map((w) => '-'.repeat(w))))
  for (const row of rows) lines.push(formatRow(row))
  return lines.join('\n')
}

function formatAuditCounts(summary: AuditSummary): string {
  const c = summary.counts
  const parts = [
    `${c.critical} critical`,
    `${c.high} high`,
    `${c.moderate} moderate`,
    `${c.low} low`,
  ]
  if (c.info > 0) parts.push(`${c.info} info`)
  return `Summary: ${parts.join(' · ')} · total ${summary.total}`
}
