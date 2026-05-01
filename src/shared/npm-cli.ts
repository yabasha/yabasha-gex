import { promisify } from 'node:util'

import type { Severity } from './types.js'

export type OutdatedInfo = {
  name: string
  current: string
  wanted: string
  latest: string
  type?: string
}

export type NpmOutdatedOptions = {
  global?: boolean
  cwd?: string
}

export type NpmUpdateOptions = {
  global?: boolean
  cwd: string
  packages?: string[]
}

async function getExecFileAsync(): Promise<
  (
    command: string,
    args?: readonly string[] | null,
    options?: any,
  ) => Promise<{ stdout: string; stderr: string }>
> {
  const { execFile } = await import('node:child_process')
  return promisify(execFile) as any
}

export async function npmOutdated(options: NpmOutdatedOptions = {}): Promise<OutdatedInfo[]> {
  const args = ['outdated', '--json']
  if (options.global) args.push('--global')

  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('npm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    return normalizeOutdated(stdout)
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    if (stdout.trim()) {
      return normalizeOutdated(stdout)
    }
    throw formatNpmError(error, 'npm outdated')
  }
}

export async function npmUpdate(options: NpmUpdateOptions): Promise<void> {
  const args = ['update']
  if (options.global) args.push('-g')
  if (options.packages && options.packages.length > 0) args.push(...options.packages)

  try {
    const execFileAsync = await getExecFileAsync()
    await execFileAsync('npm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    throw formatNpmError(error, 'npm update')
  }
}

function normalizeOutdated(stdout: string): OutdatedInfo[] {
  if (!stdout.trim()) return []
  let data: Record<string, any>
  try {
    data = JSON.parse(stdout)
  } catch {
    return []
  }

  if (!data) return []
  return Object.entries(data).map(([name, info]) => ({
    name,
    current: info?.current ? String(info.current) : '',
    wanted: info?.wanted ? String(info.wanted) : '',
    latest: info?.latest ? String(info.latest) : '',
    type: info?.type ? String(info.type) : undefined,
  }))
}

function formatNpmError(error: any, commandLabel: string): Error {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
  const message = stderr || error?.message || `${commandLabel} failed`
  return new Error(`${commandLabel} failed: ${message}`)
}

/**
 * Reads the `deprecated` field from the npm registry for a specific package
 * version. When `version` is provided, the spec passed to `npm view` is
 * `name@version` so the result reflects the *installed* version rather than
 * the latest published version. Without a version, the query falls back to
 * the latest, which can produce false positives/negatives in pinned projects.
 */
export async function npmViewDeprecated(
  packageName: string,
  version?: string,
): Promise<string | null> {
  const spec = version ? `${packageName}@${version}` : packageName
  let stdout: string
  try {
    const execFileAsync = await getExecFileAsync()
    const result = await execFileAsync('npm', ['view', spec, 'deprecated', '--json'], {
      maxBuffer: 5 * 1024 * 1024,
    })
    stdout = result.stdout
  } catch {
    return null
  }

  if (!stdout || !stdout.trim()) return null

  try {
    const parsed = JSON.parse(stdout)
    if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed
    return null
  } catch {
    return null
  }
}

export async function npmViewVersion(packageName: string): Promise<string> {
  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('npm', ['view', packageName, 'version', '--json'], {
      maxBuffer: 5 * 1024 * 1024,
    })
    const parsed = JSON.parse(stdout)
    if (typeof parsed === 'string') return parsed
    if (Array.isArray(parsed)) return parsed[parsed.length - 1] ?? ''
    return ''
  } catch (error) {
    throw formatNpmError(error, `npm view ${packageName}`)
  }
}

export type NpmAuditViaEntry =
  | string
  | {
      source?: number
      name?: string
      dependency?: string
      title?: string
      url?: string
      severity?: string
      range?: string
    }

export type NpmAuditVulnerabilityNode = {
  name?: string
  severity?: string
  isDirect?: boolean
  via?: NpmAuditViaEntry[]
  effects?: string[]
  range?: string
  nodes?: string[]
  fixAvailable?: boolean | { name: string; version: string; isSemVerMajor: boolean }
}

export type NpmAuditMetadata = {
  /** Severity → count map. Older npm versions may emit a subset of severity keys. */
  vulnerabilities?: Partial<Record<Severity, number>> & { total?: number }
  dependencies?: {
    prod?: number
    dev?: number
    optional?: number
    peer?: number
    peerOptional?: number
    total?: number
  }
}

export type NpmAuditRaw = {
  auditReportVersion?: number
  vulnerabilities?: Record<string, NpmAuditVulnerabilityNode>
  metadata?: NpmAuditMetadata
}

export type NpmAuditOptions = {
  cwd?: string
  omitDev?: boolean
}

export async function npmAudit(options: NpmAuditOptions = {}): Promise<NpmAuditRaw> {
  const args = ['audit', '--json']
  if (options.omitDev) args.push('--omit=dev')

  let stdout = ''
  try {
    const execFileAsync = await getExecFileAsync()
    const result = await execFileAsync('npm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    stdout = result.stdout
  } catch (error: any) {
    stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    if (!stdout.trim()) {
      throw formatNpmError(error, 'npm audit')
    }
  }

  if (!stdout.trim()) return {}
  try {
    return JSON.parse(stdout) as NpmAuditRaw
  } catch (error: any) {
    throw new Error(`npm audit returned malformed JSON: ${error?.message || error}`)
  }
}
