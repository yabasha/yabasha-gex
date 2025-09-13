/**
 * @fileoverview Report output utilities for CLI
 */

import path from 'node:path'

import { renderJson } from '../report/json.js'
import { renderMarkdown } from '../report/md.js'
import type { OutputFormat, Report } from '../types.js'

/**
 * Outputs a report to console or file
 *
 * @param report - The report to output
 * @param format - Output format ('json' or 'md')
 * @param outFile - Optional file path to write to
 * @param markdownExtras - Additional metadata for markdown rendering
 */
export async function outputReport(
  report: Report,
  format: OutputFormat,
  outFile?: string,
  markdownExtras?: any,
): Promise<void> {
  const content =
    format === 'json'
      ? renderJson(report)
      : renderMarkdown({ ...report, ...(markdownExtras || {}) })

  if (outFile) {
    const outDir = path.dirname(outFile)
    const { mkdir, writeFile } = await import('node:fs/promises')

    await mkdir(outDir, { recursive: true })
    await writeFile(outFile, content, 'utf8')

    console.log(`Wrote report to ${outFile}`)
  } else {
    console.log(content)
  }
}
