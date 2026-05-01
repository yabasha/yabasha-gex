/**
 * @fileoverview TypeScript type definitions for GEX dependency reporting
 */

/**
 * Information about a single package/dependency
 */
export type PackageInfo = {
  /** Package name (e.g., 'axios', '@types/node') */
  name: string
  /** Package version (e.g., '1.6.0', '^18.0.0') */
  version: string
  /** Resolved file system path to the package */
  resolved_path: string
  /** Deprecation message from the registry, or null if not deprecated. Only set when --check-deprecated is used. */
  deprecated?: string | null
}

/**
 * Severity levels emitted by the npm registry's bulk-advisories endpoint.
 * Both `npm audit` and `bun audit` use this vocabulary; bun's --audit-level
 * enum omits `info` but the bucket is preserved for npm parity.
 */
export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical'

/**
 * A single vulnerability advisory, normalized across npm and bun audit shapes.
 */
export type Vulnerability = {
  /** GHSA-xxxx or numeric advisory id, stringified */
  id: string
  /** Affected package name */
  package: string
  severity: Severity
  /** Semver range or vulnerable_versions string */
  range: string
  /** Advisory title from the registry */
  title: string
  /** Canonical URL to the advisory */
  url: string
  cve?: string
  ghsa?: string
}

/**
 * Aggregate audit metadata. `dependencies` is npm-only; bun audit does not
 * emit a metadata block, so it is undefined on the bun path. `error` is
 * populated on soft-fail and carries the underlying audit failure message.
 */
export type AuditSummary = {
  /** Severity → count map. All five keys are always present; absent severities map to 0. */
  counts: Record<Severity, number>
  total: number
  dependencies?: {
    prod: number
    dev: number
    optional: number
    peer: number
    peerOptional: number
    total: number
  }
  error?: string
}

/**
 * Complete dependency report structure
 */
export type Report = {
  /** Report format version for compatibility */
  report_version: string
  /** ISO timestamp when report was generated */
  timestamp: string
  /** Version of GEX tool that generated the report */
  tool_version: string
  /** Optional project name from package.json */
  project_name?: string
  /** Optional project version from package.json */
  project_version?: string
  /** List of globally installed packages */
  global_packages: PackageInfo[]
  /** List of local production dependencies */
  local_dependencies: PackageInfo[]
  /** List of local development dependencies */
  local_dev_dependencies: PackageInfo[]
  /** Optional raw npm ls tree data */
  tree?: unknown
  /** Audit summary block (populated by `gex audit`) */
  audit_summary?: AuditSummary
  /** Per-advisory vulnerability list (populated by `gex audit`) */
  vulnerabilities?: Vulnerability[]
}

/**
 * Supported output formats for reports
 */
export type OutputFormat = 'json' | 'md' | 'html'
