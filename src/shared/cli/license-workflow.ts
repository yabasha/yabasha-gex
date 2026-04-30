import type { Report } from '../types.js'

import {
  enrichReportWithLicenses,
  findLicenseViolations,
  formatLicenseViolations,
  type LicenseViolation,
} from './license.js'

export type LicenseWorkflowOptions = {
  enabled: boolean
  allowlist?: string[]
}

export type LicenseWorkflowResult = {
  report: Report
  violations: LicenseViolation[]
  shouldFail: boolean
}

export function parseAllowlist(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const raw = Array.isArray(value) ? value : [value]
  const entries = raw
    .flatMap((entry) =>
      String(entry)
        .split(',')
        .map((part) => part.trim()),
    )
    .filter(Boolean)
  return entries.length > 0 ? entries : []
}

export async function handleLicenseWorkflow(
  report: Report,
  options: LicenseWorkflowOptions,
): Promise<LicenseWorkflowResult> {
  const useAllowlist = Array.isArray(options.allowlist) && options.allowlist.length > 0
  if (!options.enabled && !useAllowlist) {
    return { report, violations: [], shouldFail: false }
  }

  const enriched = await enrichReportWithLicenses(report)
  const violations = useAllowlist ? findLicenseViolations(enriched, options.allowlist!) : []
  return {
    report: enriched,
    violations,
    shouldFail: violations.length > 0,
  }
}

export { formatLicenseViolations }
