export type PackageInfo = {
  name: string
  version: string
  resolved_path: string
}

export type Report = {
  report_version: string
  timestamp: string
  tool_version: string
  project_name?: string
  project_version?: string
  global_packages: PackageInfo[]
  local_dependencies: PackageInfo[]
  local_dev_dependencies: PackageInfo[]
  tree?: unknown
}

export type OutputFormat = 'json' | 'md'
