/**
 * @fileoverview Yarn (Classic) command execution utilities for dependency analysis.
 *
 * Targets Yarn 1.x. Yarn Berry (2.x+) uses a different CLI surface and is not
 * supported here yet — invocations error out with a clear message.
 */

import path from 'node:path'
import { promisify } from 'node:util'

export type YarnPmLsOptions = {
  global?: boolean
  omitDev?: boolean
  cwd?: string
}

type PackageNode = {
  version: string
  path: string
}

type YarnPackageTree = {
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

async function readJson(file: string): Promise<any | null> {
  try {
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Reads `yarn --version` and returns the trimmed string.
 */
export async function yarnVersion(cwd?: string): Promise<string> {
  const execFileAsync = await getExecFileAsync()
  try {
    const { stdout } = await execFileAsync('yarn', ['--version'], { cwd })
    return stdout.trim()
  } catch (err: any) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : ''
    const msg = stderr || err?.message || 'yarn --version failed'
    throw new Error(`yarn --version failed: ${msg}`)
  }
}

/**
 * Returns true when the active yarn binary is Berry (Yarn 2.x+).
 */
function isYarnBerry(version: string): boolean {
  const major = parseInt(version.split('.')[0] || '0', 10)
  return Number.isFinite(major) && major >= 2
}

/**
 * Returns the yarn global root directory (parent of node_modules).
 */
export async function yarnRootGlobal(): Promise<string> {
  const execFileAsync = await getExecFileAsync()
  try {
    const { stdout } = await execFileAsync('yarn', ['global', 'dir'])
    return path.join(stdout.trim(), 'node_modules')
  } catch (err: any) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : ''
    const msg = stderr || err?.message || 'yarn global dir failed'
    throw new Error(`yarn global dir failed: ${msg}`)
  }
}

/**
 * Lists installed packages reported by Yarn Classic.
 *
 * Local mode reads package.json to split the flat tree into prod/dev buckets.
 * Global mode resolves paths under `yarn global dir`/node_modules.
 */
export async function yarnPmLs(options: YarnPmLsOptions = {}): Promise<YarnPackageTree> {
  const execFileAsync = await getExecFileAsync()

  const version = await yarnVersion(options.cwd)
  if (isYarnBerry(version)) {
    throw new Error(
      `Yarn Berry (${version}) is not supported. Use Yarn Classic (1.x) or run gex-node / gex-pnpm.`,
    )
  }

  if (options.global) {
    const globalRoot = await yarnRootGlobal()
    const args = ['global', 'list', '--json', '--depth=0']
    const { stdout } = await runYarnList(execFileAsync, args)
    const trees = parseYarnTrees(stdout)
    const dependencies: Record<string, PackageNode> = {}
    for (const entry of trees) {
      const { name, version: ver } = parseNameVersion(entry)
      if (!name) continue
      dependencies[name] = { version: ver, path: packagePath(globalRoot, name) }
    }
    return { dependencies, node_modules_path: globalRoot }
  }

  const cwd = options.cwd || process.cwd()
  const nodeModulesPath = path.join(cwd, 'node_modules')
  const manifest = await readJson(path.join(cwd, 'package.json'))
  const devNames = new Set(Object.keys(manifest?.devDependencies || {}))

  const args = ['list', '--json', '--depth=0']
  if (options.omitDev) args.push('--prod')

  const { stdout } = await runYarnList(execFileAsync, args, cwd)
  const trees = parseYarnTrees(stdout)

  const dependencies: Record<string, PackageNode> = {}
  const devDependencies: Record<string, PackageNode> = {}
  for (const entry of trees) {
    const { name, version: ver } = parseNameVersion(entry)
    if (!name) continue
    const node = { version: ver, path: packagePath(nodeModulesPath, name) }
    if (!options.omitDev && devNames.has(name)) {
      devDependencies[name] = node
    } else {
      dependencies[name] = node
    }
  }

  return {
    dependencies,
    devDependencies: options.omitDev ? undefined : devDependencies,
    node_modules_path: nodeModulesPath,
  }
}

async function runYarnList(
  execFileAsync: (
    command: string,
    args?: readonly string[] | null,
    options?: any,
  ) => Promise<{ stdout: string; stderr: string }>,
  args: readonly string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('yarn', args, { cwd, maxBuffer: 10 * 1024 * 1024 })
  } catch (err: any) {
    const stdout = typeof err?.stdout === 'string' ? err.stdout : ''
    if (stdout.trim()) return { stdout, stderr: err?.stderr || '' }
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : ''
    const msg = stderr || err?.message || 'yarn list failed'
    throw new Error(`yarn list failed: ${msg}`)
  }
}

function parseYarnTrees(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: any
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (parsed && parsed.type === 'tree' && parsed.data && Array.isArray(parsed.data.trees)) {
      for (const node of parsed.data.trees) {
        if (node && typeof node.name === 'string') names.push(node.name)
      }
    }
  }
  return names
}

function parseNameVersion(spec: string): { name: string; version: string } {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return { name: spec, version: '' }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) }
}

function packagePath(root: string, name: string): string {
  if (name.startsWith('@')) {
    const [scope, sub] = name.split('/')
    return path.join(root, scope, sub || '')
  }
  return path.join(root, name)
}
