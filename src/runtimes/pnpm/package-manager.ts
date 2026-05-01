/**
 * @fileoverview pnpm command execution utilities for dependency analysis.
 */

import { promisify } from 'node:util'

export type PnpmPmLsOptions = {
  global?: boolean
  omitDev?: boolean
  cwd?: string
}

type PackageNode = {
  version: string
  path: string
}

type PnpmPackageTree = {
  dependencies: Record<string, PackageNode>
  devDependencies?: Record<string, PackageNode>
  node_modules_path?: string
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

/**
 * Lists installed packages reported by pnpm.
 *
 * `pnpm list --json --depth=0` emits a JSON array; entry zero contains
 * `dependencies` / `devDependencies` shaped like `{ name: { version, path } }`.
 */
export async function pnpmPmLs(options: PnpmPmLsOptions = {}): Promise<PnpmPackageTree> {
  const args = ['list', '--json', '--depth=0']
  if (options.global) args.push('--global')
  if (options.omitDev) args.push('--prod')

  let stdout = ''
  try {
    const execFileAsync = await getExecFileAsync()
    const result = await execFileAsync('pnpm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    stdout = result.stdout
  } catch (err: any) {
    const errStdout = typeof err?.stdout === 'string' ? err.stdout : ''
    if (errStdout.trim()) {
      stdout = errStdout
    } else {
      const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : ''
      const msg = stderr || err?.message || 'pnpm list failed'
      throw new Error(`pnpm list failed: ${msg}`)
    }
  }

  if (!stdout || !stdout.trim()) {
    return {
      dependencies: {},
      devDependencies: options.omitDev ? undefined : {},
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return {
      dependencies: {},
      devDependencies: options.omitDev ? undefined : {},
    }
  }

  const root = Array.isArray(parsed) ? parsed[0] || {} : parsed || {}

  return {
    dependencies: normalizeDeps(root.dependencies),
    devDependencies: options.omitDev ? undefined : normalizeDeps(root.devDependencies),
    node_modules_path: typeof root.path === 'string' ? `${root.path}/node_modules` : undefined,
  }
}

/**
 * Returns the trimmed `pnpm root -g` global node_modules directory.
 */
export async function pnpmRootGlobal(): Promise<string> {
  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('pnpm', ['root', '-g'])
    return stdout.trim()
  } catch (err: any) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : ''
    const msg = stderr || err?.message || 'pnpm root -g failed'
    throw new Error(`pnpm root -g failed: ${msg}`)
  }
}

function normalizeDeps(obj: any): Record<string, PackageNode> {
  if (!obj || typeof obj !== 'object') return {}
  const result: Record<string, PackageNode> = {}
  for (const [name, info] of Object.entries(obj as Record<string, any>)) {
    if (!info || typeof info !== 'object') continue
    const version = typeof (info as any).version === 'string' ? (info as any).version : ''
    const pkgPath = typeof (info as any).path === 'string' ? (info as any).path : ''
    result[name] = { version, path: pkgPath }
  }
  return result
}
