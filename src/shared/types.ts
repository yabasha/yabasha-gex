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
}

/**
 * Supported output formats for reports
 */
export type OutputFormat = 'json' | 'md'
