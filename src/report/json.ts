/**
 * @fileoverview JSON report rendering utilities
 */

import type { Report } from '../types.js'

/**
 * Renders a Report object as formatted JSON string
 *
 * @param report - Report object to render
 * @returns Pretty-printed JSON string with consistent package ordering
 *
 * @example
 * ```typescript
 * import { renderJson } from './report/json.js'
 *
 * const report = {
 *   report_version: '1.0',
 *   timestamp: new Date().toISOString(),
 *   tool_version: '0.3.2',
 *   global_packages: [],
 *   local_dependencies: [{ name: 'axios', version: '1.6.0', resolved_path: '/path/to/axios' }],
 *   local_dev_dependencies: []
 * }
 *
 * const jsonOutput = renderJson(report)
 * console.log(jsonOutput) // Pretty-printed JSON
 * ```
 */
export function renderJson(report: Report): string {
  const r: Report = {
    ...report,
    global_packages: [...report.global_packages].sort((a, b) => a.name.localeCompare(b.name)),
    local_dependencies: [...report.local_dependencies].sort((a, b) => a.name.localeCompare(b.name)),
    local_dev_dependencies: [...report.local_dev_dependencies].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }
  return JSON.stringify(r, null, 2)
}
