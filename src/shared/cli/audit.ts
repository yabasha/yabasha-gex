import type { AuditAdvisory, AuditResult, AuditSeverity, AuditSummary } from '../npm-cli.js'

import { createLoader } from './loader.js'

const SEVERITY_ORDER: AuditSeverity[] = ['info', 'low', 'moderate', 'high', 'critical']

export function severityRank(severity: AuditSeverity): number {
  return SEVERITY_ORDER.indexOf(severity)
}

export function highestSeverity(summary: AuditSummary): AuditSeverity | null {
  for (let i = SEVERITY_ORDER.length - 1; i >= 0; i -= 1) {
    const sev = SEVERITY_ORDER[i]
    if ((summary[sev] ?? 0) > 0) return sev
  }
  return null
}

export function meetsFailThreshold(summary: AuditSummary, threshold: AuditSeverity): boolean {
  const top = highestSeverity(summary)
  if (!top) return false
  return severityRank(top) >= severityRank(threshold)
}

export function formatAuditSummary(summary: AuditSummary): string {
  if (summary.total === 0) return 'No vulnerabilities found'
  const parts: string[] = []
  for (let i = SEVERITY_ORDER.length - 1; i >= 0; i -= 1) {
    const sev = SEVERITY_ORDER[i]
    const count = summary[sev] ?? 0
    if (count > 0) parts.push(`${count} ${sev}`)
  }
  return `${summary.total} vulnerabilities (${parts.join(', ')})`
}

export function formatAuditTable(vulnerabilities: AuditAdvisory[]): string {
  const headers = ['Package', 'Severity', 'Range', 'Fix', 'Title']
  const rows = vulnerabilities.map((v) => [
    v.name,
    v.severity,
    v.range || '-',
    v.fix_available ? 'yes' : 'no',
    v.title || '-',
  ])

  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => row[idx].length)),
  )

  const formatRow = (cols: string[]) =>
    cols.map((col, idx) => col.padEnd(widths[idx], ' ')).join('  ')

  const lines = [formatRow(headers), formatRow(widths.map((w) => '-'.repeat(w)))]
  for (const row of rows) lines.push(formatRow(row))
  return lines.join('\n')
}

export function isSeverityFlag(value: unknown): value is AuditSeverity {
  return typeof value === 'string' && (SEVERITY_ORDER as string[]).includes(value)
}

export type AuditWorkflowOptions = {
  enabled: boolean
  failOn?: AuditSeverity
  runAudit: () => Promise<AuditResult>
  showSpinner?: boolean
}

export type AuditWorkflowResult = {
  audit?: AuditResult
  shouldFail: boolean
}

export async function handleAuditWorkflow(
  options: AuditWorkflowOptions,
): Promise<AuditWorkflowResult> {
  if (!options.enabled) return { shouldFail: false }

  const loader = options.showSpinner ? createLoader('Auditing dependencies') : undefined
  let audit: AuditResult
  try {
    audit = await options.runAudit()
  } finally {
    loader?.stop('Finished audit.')
  }

  const shouldFail = options.failOn ? meetsFailThreshold(audit.summary, options.failOn) : false
  return { audit, shouldFail }
}
