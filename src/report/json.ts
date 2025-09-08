import type { Report } from '../types.js'

export function renderJson(report: Report): string {
  // Ensure stable ordering (defensive; arrays already sorted)
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
