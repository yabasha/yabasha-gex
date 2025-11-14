import path from 'node:path'
import { constants as fsConstants, type Dirent } from 'node:fs'
import { access, readFile, readdir, stat } from 'node:fs/promises'

export type BunPmLsOptions = {
  global?: boolean
  omitDev?: boolean
  depth0?: boolean
  cwd?: string
}

type PackageNode = {
  version: string
  path: string
}

type BunPackageTree = {
  dependencies: Record<string, PackageNode>
  devDependencies?: Record<string, PackageNode>
  node_modules_path?: string
}

const IGNORED_ENTRIES = new Set(['.bin'])

/**
 * Executes a Bun package listing by inspecting node_modules directories directly.
 */
export async function bunPmLs(options: BunPmLsOptions = {}): Promise<BunPackageTree> {
  if (options.global) {
    const root = await bunPmRootGlobal()
    const manifest = await readJson(path.join(path.dirname(root), 'package.json'))
    const selections = buildSelections(manifest, { includeDev: false })
    const dependencies =
      selections.prod.size > 0
        ? await collectPackagesForNames(root, mapSelections(selections.prod))
        : await collectPackagesFromNodeModules(root)
    return { dependencies, node_modules_path: root }
  }

  const cwd = options.cwd || process.cwd()
  const nodeModulesPath = await bunPmRootLocal(cwd)
  const manifest = await readJson(path.join(cwd, 'package.json'))
  const includeDev = !options.omitDev
  const selections = buildSelections(manifest, { includeDev })

  const dependencies =
    selections.prod.size > 0
      ? await collectPackagesForNames(nodeModulesPath, mapSelections(selections.prod))
      : await collectPackagesFromNodeModules(nodeModulesPath)

  let devDependencies: Record<string, PackageNode> | undefined
  if (includeDev) {
    if (selections.dev.size > 0) {
      devDependencies = await collectPackagesForNames(
        nodeModulesPath,
        mapSelections(selections.dev),
      )
    } else {
      devDependencies = {}
    }
  }

  return { dependencies, devDependencies, node_modules_path: nodeModulesPath }
}

/**
 * Attempts to resolve the Bun global node_modules directory.
 */
export async function bunPmRootGlobal(): Promise<string> {
  if (process.env.GEX_BUN_GLOBAL_ROOT) {
    return process.env.GEX_BUN_GLOBAL_ROOT
  }

  const candidates = getGlobalRootCandidates()
  for (const candidate of candidates) {
    if (candidate && (await pathExists(candidate))) {
      return candidate
    }
  }

  return (
    candidates.find((c) => Boolean(c)) ||
    path.join(process.env.HOME || process.cwd(), '.bun', 'install', 'global', 'node_modules')
  )
}

/**
 * Resolves the Bun local node_modules directory for the provided cwd.
 */
export async function bunPmRootLocal(cwd: string = process.cwd()): Promise<string> {
  if (process.env.GEX_BUN_LOCAL_ROOT) {
    return process.env.GEX_BUN_LOCAL_ROOT
  }
  return path.join(cwd, 'node_modules')
}

async function collectPackagesForNames(
  nodeModulesPath: string,
  packages: { name: string; declared?: string }[],
): Promise<Record<string, PackageNode>> {
  const result: Record<string, PackageNode> = {}
  await Promise.all(
    packages.map(async ({ name, declared }) => {
      const pkgDir = packageDir(nodeModulesPath, name)
      const manifest = await readJson(path.join(pkgDir, 'package.json'))
      const pkgName = typeof manifest?.name === 'string' ? manifest.name : name
      const version = typeof manifest?.version === 'string' ? manifest.version : declared || ''
      result[pkgName] = { version, path: pkgDir }
    }),
  )
  return result
}

async function collectPackagesFromNodeModules(root: string): Promise<Record<string, PackageNode>> {
  const result: Record<string, PackageNode> = {}
  const entries = await safeReadDir(root)

  for (const entry of entries) {
    if (!entry || !entry.name || entry.name.startsWith('.') || IGNORED_ENTRIES.has(entry.name)) {
      continue
    }

    const entryPath = path.join(root, entry.name)
    if (!(await isDir(entry, entryPath))) continue

    if (entry.name.startsWith('@')) {
      const scopedEntries = await safeReadDir(entryPath)
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry || !scopedEntry.name || scopedEntry.name.startsWith('.')) continue
        const scopedPath = path.join(entryPath, scopedEntry.name)
        if (!(await isDir(scopedEntry, scopedPath))) continue
        const manifest = await readJson(path.join(scopedPath, 'package.json'))
        const pkgName =
          typeof manifest?.name === 'string' ? manifest.name : `${entry.name}/${scopedEntry.name}`
        const version = typeof manifest?.version === 'string' ? manifest.version : ''
        result[pkgName] = { version, path: scopedPath }
      }
    } else {
      const manifest = await readJson(path.join(entryPath, 'package.json'))
      const pkgName = typeof manifest?.name === 'string' ? manifest.name : entry.name
      const version = typeof manifest?.version === 'string' ? manifest.version : ''
      result[pkgName] = { version, path: entryPath }
    }
  }

  return result
}

async function readJson(file: string): Promise<any | null> {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function packageDir(root: string, packageName: string): string {
  const segments = packageName.startsWith('@') ? packageName.split('/') : [packageName]
  return path.join(root, ...segments)
}

function buildSelections(
  manifest: Record<string, any> | null,
  { includeDev }: { includeDev: boolean },
): { prod: Map<string, string | undefined>; dev: Map<string, string | undefined> } {
  const prod = new Map<string, string | undefined>()
  const dev = new Map<string, string | undefined>()

  const addAll = (
    target: Map<string, string | undefined>,
    record: Record<string, string> | undefined,
  ) => {
    if (!record) return
    for (const [name, range] of Object.entries(record)) {
      if (!target.has(name)) {
        target.set(name, range)
      }
    }
  }

  addAll(prod, manifest?.dependencies)
  addAll(prod, manifest?.optionalDependencies)
  if (includeDev) addAll(dev, manifest?.devDependencies)

  return { prod, dev }
}

function mapSelections(
  map: Map<string, string | undefined>,
): { name: string; declared?: string }[] {
  return Array.from(map.entries()).map(([name, declared]) => ({ name, declared }))
}

async function safeReadDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function isDir(entry: Dirent, fullPath: string): Promise<boolean> {
  if (entry.isDirectory()) return true
  if (entry.isSymbolicLink()) {
    try {
      const stats = await stat(fullPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }
  return false
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

function getGlobalRootCandidates(): string[] {
  const candidates = new Set<string>()
  const bunInstall =
    process.env.BUN_INSTALL || (process.env.HOME ? path.join(process.env.HOME, '.bun') : undefined)
  const maybeAdd = (value: string | undefined) => {
    if (value) candidates.add(value)
  }

  if (bunInstall) {
    maybeAdd(path.join(bunInstall, 'install', 'global', 'node_modules'))
    maybeAdd(path.join(bunInstall, 'global', 'node_modules'))
  }
  if (process.env.XDG_DATA_HOME) {
    maybeAdd(path.join(process.env.XDG_DATA_HOME, 'bun', 'install', 'global', 'node_modules'))
  }
  maybeAdd('/usr/local/share/bun/global/node_modules')
  maybeAdd('/opt/homebrew/var/bun/install/global/node_modules')

  return Array.from(candidates)
}
