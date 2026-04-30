import { promisify } from 'node:util'

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

export type AuditSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical'

export type AuditAdvisory = {
  name: string
  severity: AuditSeverity
  range: string
  fix_available: boolean
  title?: string
  url?: string
}

export type AuditSummary = {
  info: number
  low: number
  moderate: number
  high: number
  critical: number
  total: number
}

export type AuditResult = {
  summary: AuditSummary
  vulnerabilities: AuditAdvisory[]
}

export type NpmAuditOptions = {
  cwd?: string
  omitDev?: boolean
}

const SEVERITIES: AuditSeverity[] = ['info', 'low', 'moderate', 'high', 'critical']

function isSeverity(value: unknown): value is AuditSeverity {
  return typeof value === 'string' && (SEVERITIES as string[]).includes(value)
}

export function parseAuditPayload(stdout: string): AuditResult {
  const empty: AuditResult = {
    summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    vulnerabilities: [],
  }
  if (!stdout.trim()) return empty

  let data: any
  try {
    data = JSON.parse(stdout)
  } catch {
    return empty
  }

  const counts = data?.metadata?.vulnerabilities ?? {}
  const summary: AuditSummary = {
    info: Number(counts.info) || 0,
    low: Number(counts.low) || 0,
    moderate: Number(counts.moderate) || 0,
    high: Number(counts.high) || 0,
    critical: Number(counts.critical) || 0,
    total: Number(counts.total) || 0,
  }

  const vulns: AuditAdvisory[] = []
  const vulnMap = data?.vulnerabilities
  if (vulnMap && typeof vulnMap === 'object') {
    for (const [name, entry] of Object.entries<any>(vulnMap)) {
      const severity = isSeverity(entry?.severity) ? entry.severity : 'info'
      const viaSource = Array.isArray(entry?.via)
        ? entry.via.find((v: any) => v && typeof v === 'object')
        : undefined
      vulns.push({
        name,
        severity,
        range: typeof entry?.range === 'string' ? entry.range : '',
        fix_available: Boolean(entry?.fixAvailable),
        title: viaSource?.title ? String(viaSource.title) : undefined,
        url: viaSource?.url ? String(viaSource.url) : undefined,
      })
    }
  }

  return { summary, vulnerabilities: vulns }
}

export async function npmAudit(options: NpmAuditOptions = {}): Promise<AuditResult> {
  const args = ['audit', '--json']
  if (options.omitDev) args.push('--omit=dev')

  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('npm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    return parseAuditPayload(stdout)
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    if (stdout.trim()) {
      return parseAuditPayload(stdout)
    }
    throw formatNpmError(error, 'npm audit')
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
