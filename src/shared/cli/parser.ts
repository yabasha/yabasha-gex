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

/**
 * Parses a markdown table and extracts package information
 *
 * @param lines - Array of file lines
 * @param startIndex - Index where table starts
 * @returns Array of package information
 */
function parseMarkdownPackagesTable(lines: string[], startIndex: number): PackageInfo[] {
  const rows: PackageInfo[] = []
  if (!lines[startIndex] || !lines[startIndex].trim().startsWith('|')) return rows

  let i = startIndex + 2
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cols = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === 0 || idx === arr.length - 1))

    const [name = '', version = '', resolved_path = ''] = cols
    if (name) rows.push({ name, version, resolved_path })
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
