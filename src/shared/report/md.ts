/**
 * @fileoverview Markdown report rendering utilities
 */

import { SEVERITY_RANK } from '../cli/audit.js'
import type { AuditSummary, PackageInfo, Report, Severity, Vulnerability } from '../types.js'

/**
 * Creates a markdown table from headers and row data
 *
 * @param headers - Array of table header strings
 * @param rows - Array of row data (each row is array of strings)
 * @returns Formatted markdown table string
 */
function table(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
  return [header, sep, body].filter(Boolean).join('\n')
}

function hasAnyDeprecation(packages: PackageInfo[]): boolean {
  return packages.some((p) => typeof p.deprecated === 'string' && p.deprecated.length > 0)
}

function deprecationCell(pkg: PackageInfo): string {
  if (typeof pkg.deprecated === 'string' && pkg.deprecated.length > 0) {
    return `⚠ ${pkg.deprecated}`
  }
  return ''
}

function packageRows(
  packages: PackageInfo[],
  showDeprecated: boolean,
): { headers: string[]; rows: string[][] } {
  const headers = showDeprecated
    ? ['Name', 'Version', 'Path', 'Deprecated']
    : ['Name', 'Version', 'Path']
  const rows = packages.map((p) => {
    const base = [p.name, p.version || '', p.resolved_path || '']
    return showDeprecated ? [...base, deprecationCell(p)] : base
  })
  return { headers, rows }
}

const SEVERITY_EMOJI: Record<Severity, string> = {
  info: 'ℹ️',
  low: '🔵',
  moderate: '🟡',
  high: '🟠',
  critical: '🔴',
}

function vulnerabilitiesSection(
  summary: AuditSummary | undefined,
  vulns: Vulnerability[] | undefined,
): string[] {
  if (!summary) return []
  const lines: string[] = ['## Vulnerabilities', '']

  if (summary.error) {
    lines.push(`_Audit failed: ${summary.error}_`)
    lines.push('')
    return lines
  }

  const c = summary.counts
  const parts: string[] = []
  if (c.info > 0) parts.push(`ℹ️ ${c.info} info`)
  parts.push(`🔴 ${c.critical} critical`)
  parts.push(`🟠 ${c.high} high`)
  parts.push(`🟡 ${c.moderate} moderate`)
  parts.push(`🔵 ${c.low} low`)
  lines.push(`**Summary:** ${parts.join(' · ')} · total ${summary.total}`)
  lines.push('')

  const list = vulns || []
  if (list.length === 0) {
    lines.push('No vulnerabilities found.')
    lines.push('')
    return lines
  }

  const sorted = [...list].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  const headers = ['Package', 'Severity', 'Range', 'ID', 'Title']
  const rows = sorted.map((v) => [
    v.package,
    `${SEVERITY_EMOJI[v.severity]} ${v.severity}`,
    v.range || '',
    v.id,
    v.title || '',
  ])
  lines.push(table(headers, rows))
  lines.push('')
  return lines
}

/**
 * Renders a Report object as formatted Markdown
 *
 * @param report - Report object with optional project metadata
 * @returns Formatted Markdown string with tables and sections
 *
 * @example
 * ```typescript
 * import { renderMarkdown } from './report/md.js'
 *
 * const report = {
 *   report_version: '1.0',
 *   timestamp: new Date().toISOString(),
 *   tool_version: '0.3.2',
 *   project_name: 'my-project',
 *   global_packages: [],
 *   local_dependencies: [
 *     { name: 'axios', version: '1.6.0', resolved_path: '/path/to/axios' }
 *   ],
 *   local_dev_dependencies: [],
 *   project_description: 'My awesome project'
 * }
 *
 * const markdown = renderMarkdown(report)
 * console.log(markdown) // Formatted markdown with tables
 * ```
 */
export function renderMarkdown(
  report: Report & {
    project_description?: string
    project_homepage?: string
    project_bugs?: string
  },
): string {
  const lines: string[] = []
  lines.push('# GEX Report')
  lines.push('')

  if (
    report.project_name ||
    report.project_version ||
    (report as any).project_description ||
    (report as any).project_homepage ||
    (report as any).project_bugs
  ) {
    lines.push('## Project Metadata')
    if (report.project_name) lines.push(`- Name: ${report.project_name}`)
    if (report.project_version) lines.push(`- Version: ${report.project_version}`)
    if ((report as any).project_description)
      lines.push(`- Description: ${(report as any).project_description}`)
    if ((report as any).project_homepage)
      lines.push(`- Homepage: ${(report as any).project_homepage}`)
    if ((report as any).project_bugs) lines.push(`- Bugs: ${(report as any).project_bugs}`)
    lines.push('')
  }

  if (report.global_packages.length > 0) {
    lines.push('## Global Packages')
    const { headers, rows } = packageRows(
      report.global_packages,
      hasAnyDeprecation(report.global_packages),
    )
    lines.push(table(headers, rows))
    lines.push('')
  }

  if (report.local_dependencies.length > 0) {
    lines.push('## Local Dependencies')
    const { headers, rows } = packageRows(
      report.local_dependencies,
      hasAnyDeprecation(report.local_dependencies),
    )
    lines.push(table(headers, rows))
    lines.push('')
  }

  if (report.local_dev_dependencies.length > 0) {
    lines.push('## Local Dev Dependencies')
    const { headers, rows } = packageRows(
      report.local_dev_dependencies,
      hasAnyDeprecation(report.local_dev_dependencies),
    )
    lines.push(table(headers, rows))
    lines.push('')
  }

  for (const line of vulnerabilitiesSection(report.audit_summary, report.vulnerabilities)) {
    lines.push(line)
  }

  lines.push('---')
  lines.push('_Generated by GEX_')

  return lines.join('\n')
}
