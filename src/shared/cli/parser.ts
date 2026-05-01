/**
 * @fileoverview Report parsing utilities for CLI
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { PackageInfo, Report } from '../types.js'

/**
 * Checks if a file path indicates a markdown report
 */
export function isMarkdownReportFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ext === '.md' || ext === '.markdown'
}

function splitMarkdownRow(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((_, idx, arr) => !(idx === 0 || idx === arr.length - 1))
}

/**
 * Parses a markdown table and extracts package information.
 *
 * Reads the header row at `startIndex` to detect column positions, so this
 * works whether the table has the base 3 columns (Name, Version, Path) or
 * the 4-column variant emitted when any package has a `deprecated` field
 * set (Name, Version, Path, Deprecated). Without this header detection the
 * `Deprecated` column would be silently dropped on markdown round-trips.
 *
 * @param lines - Array of file lines
 * @param startIndex - Index of the header row
 * @returns Array of package information
 */
function parseMarkdownPackagesTable(lines: string[], startIndex: number): PackageInfo[] {
  const rows: PackageInfo[] = []
  if (!lines[startIndex] || !lines[startIndex].trim().startsWith('|')) return rows

  const header = splitMarkdownRow(lines[startIndex]).map((c) => c.toLowerCase())
  const nameIdx = header.indexOf('name')
  const versionIdx = header.indexOf('version')
  const pathIdx = header.indexOf('path')
  const deprecatedIdx = header.indexOf('deprecated')

  let i = startIndex + 2
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cols = splitMarkdownRow(lines[i])
    const name = nameIdx >= 0 ? cols[nameIdx] || '' : cols[0] || ''
    const version = versionIdx >= 0 ? cols[versionIdx] || '' : cols[1] || ''
    const resolved_path = pathIdx >= 0 ? cols[pathIdx] || '' : cols[2] || ''

    if (name) {
      const pkg: PackageInfo = { name, version, resolved_path }
      if (deprecatedIdx >= 0) {
        const cell = cols[deprecatedIdx] || ''
        // Renderer emits "⚠ <message>" for deprecated entries and "" for non-deprecated.
        // Round-trip preserves the message when present; absent cells map to null
        // so consumers can distinguish "checked, not deprecated" from "not checked".
        const stripped = cell.replace(/^⚠\s+/, '')
        pkg.deprecated = stripped.length > 0 ? stripped : null
      }
      rows.push(pkg)
    }
    i++
  }
  return rows
}

/**
 * Parses a markdown report and converts it to a Report object
 *
 * @param md - Markdown content to parse
 * @returns Parsed Report object
 */
export function parseMarkdownReport(md: string): Report {
  const lines = md.split(/\r?\n/)

  const findSection = (title: string) =>
    lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase())

  const parseSection = (idx: number): PackageInfo[] => {
    if (idx < 0) return []

    let i = idx + 1
    while (i < lines.length && !lines[i].trim().startsWith('|')) i++
    return parseMarkdownPackagesTable(lines, i)
  }

  const global_packages = parseSection(findSection('Global Packages'))
  const local_dependencies = parseSection(findSection('Local Dependencies'))
  const local_dev_dependencies = parseSection(findSection('Local Dev Dependencies'))

  const report: Report = {
    report_version: '1.0',
    timestamp: new Date().toISOString(),
    tool_version: 'unknown',
    global_packages,
    local_dependencies,
    local_dev_dependencies,
  }
  return report
}

/**
 * Loads and parses a report file (JSON or Markdown)
 *
 * @param reportPath - Path to the report file
 * @returns Parsed Report object
 * @throws {Error} If file cannot be read or parsed
 */
export async function loadReportFromFile(reportPath: string): Promise<Report> {
  const raw = await readFile(reportPath, 'utf8')

  if (isMarkdownReportFile(reportPath) || raw.startsWith('# GEX Report')) {
    return parseMarkdownReport(raw)
  }

  return JSON.parse(raw) as Report
}
