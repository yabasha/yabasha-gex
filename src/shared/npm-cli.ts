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

async function getExecFileAsync(): Promise<(
  command: string,
  args?: readonly string[] | null,
  options?: any,
) => Promise<{ stdout: string; stderr: string }>> {
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
