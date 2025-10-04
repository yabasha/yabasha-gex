/**
 * @fileoverview HTML report rendering utilities
 */

import type { Report } from '../types.js'

/**
 * Creates an HTML table from headers and row data
 *
 * @param headers - Array of table header strings
 * @param rows - Array of row data (each row is array of strings)
 * @returns HTML table string
 */
function table(headers: string[], rows: string[][]): string {
  const headerHtml = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`
  const bodyHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`
}

/**
 * Escapes HTML entities in a string
 *
 * @param text - Text to escape
 * @returns HTML-escaped string
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char])
}

/**
 * Renders a Report object as formatted HTML
 *
 * @param report - Report object with optional project metadata
 * @returns Formatted HTML string with tables and styling
 *
 * @example
 * ```typescript
 * import { renderHtml } from './report/html.js'
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
 * }
 *
 * const html = renderHtml(report)
 * console.log(html) // Formatted HTML with tables
 * ```
 */
export function renderHtml(
  report: Report & {
    project_description?: string
    project_homepage?: string
    project_bugs?: string
  },
): string {
  const hasProjectMeta =
    report.project_name ||
    report.project_version ||
    (report as any).project_description ||
    (report as any).project_homepage ||
    (report as any).project_bugs

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GEX Report - ${report.project_name || 'Dependency Audit'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
      margin-top: 0;
    }
    h2 {
      color: #34495e;
      border-bottom: 2px solid #bdc3c7;
      padding-bottom: 8px;
      margin-top: 40px;
      margin-bottom: 20px;
    }
    .metadata {
      background: #ecf0f1;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .metadata dl {
      margin: 0;
    }
    .metadata dt {
      font-weight: bold;
      color: #2c3e50;
      margin-top: 10px;
    }
    .metadata dt:first-child {
      margin-top: 0;
    }
    .metadata dd {
      margin: 5px 0 0 20px;
      color: #555;
    }
    .metadata dd a {
      color: #3498db;
      text-decoration: none;
    }
    .metadata dd a:hover {
      text-decoration: underline;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      background: white;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th {
      background: #3498db;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #ecf0f1;
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 14px;
    }
    tr:nth-child(even) {
      background: #f8f9fa;
    }
    tr:hover {
      background: #e8f4fd;
    }
    .footer {
      text-align: center;
      color: #7f8c8d;
      font-size: 14px;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ecf0f1;
    }
    .footer strong {
      color: #2c3e50;
    }
    .no-data {
      text-align: center;
      color: #7f8c8d;
      font-style: italic;
      padding: 40px;
    }
    .timestamp {
      color: #95a5a6;
      font-size: 14px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>GEX Dependency Report</h1>

    ${
      hasProjectMeta
        ? `
    <section class="metadata">
      <h2>Project Information</h2>
      <dl>
        ${report.project_name ? `<dt>Project Name</dt><dd>${escapeHtml(report.project_name)}</dd>` : ''}
        ${report.project_version ? `<dt>Version</dt><dd>${escapeHtml(report.project_version)}</dd>` : ''}
        ${(report as any).project_description ? `<dt>Description</dt><dd>${escapeHtml((report as any).project_description)}</dd>` : ''}
        ${(report as any).project_homepage ? `<dt>Homepage</dt><dd><a href="${escapeHtml((report as any).project_homepage)}" target="_blank">${escapeHtml((report as any).project_homepage)}</a></dd>` : ''}
        ${(report as any).project_bugs ? `<dt>Bugs</dt><dd><a href="${escapeHtml((report as any).project_bugs)}" target="_blank">${escapeHtml((report as any).project_bugs)}</a></dd>` : ''}
        <dt>Report Generated</dt><dd>${new Date(report.timestamp).toLocaleString()}</dd>
      </dl>
    </section>
    `
        : ''
    }

    ${
      report.global_packages.length > 0
        ? `
    <section>
      <h2>Global Packages <small>(${report.global_packages.length})</small></h2>
      ${table(
        ['Name', 'Version', 'Path'],
        report.global_packages.map((p) => [
          escapeHtml(p.name),
          escapeHtml(p.version || ''),
          escapeHtml(p.resolved_path || ''),
        ]),
      )}
    </section>
    `
        : '<section><h2>Global Packages</h2><div class="no-data">No global packages found</div></section>'
    }

    ${
      report.local_dependencies.length > 0
        ? `
    <section>
      <h2>Local Dependencies <small>(${report.local_dependencies.length})</small></h2>
      ${table(
        ['Name', 'Version', 'Path'],
        report.local_dependencies.map((p) => [
          escapeHtml(p.name),
          escapeHtml(p.version || ''),
          escapeHtml(p.resolved_path || ''),
        ]),
      )}
    </section>
    `
        : '<section><h2>Local Dependencies</h2><div class="no-data">No local dependencies found</div></section>'
    }

    ${
      report.local_dev_dependencies.length > 0
        ? `
    <section>
      <h2>Local Dev Dependencies <small>(${report.local_dev_dependencies.length})</small></h2>
      ${table(
        ['Name', 'Version', 'Path'],
        report.local_dev_dependencies.map((p) => [
          escapeHtml(p.name),
          escapeHtml(p.version || ''),
          escapeHtml(p.resolved_path || ''),
        ]),
      )}
    </section>
    `
        : '<section><h2>Local Dev Dependencies</h2><div class="no-data">No local dev dependencies found</div></section>'
    }

    <footer class="footer">
      <p>Generated by <strong>GEX v${escapeHtml(report.tool_version)}</strong> on ${new Date(report.timestamp).toLocaleString()}</p>
      <p>Report format version: ${escapeHtml(report.report_version)}</p>
    </footer>
  </div>
</body>
</html>`
}
