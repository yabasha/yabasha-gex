/**
 * @fileoverview Pure parsers for npm and Bun lockfiles. They produce a
 * dependency tree shape compatible with `buildReportFromNpmTree`, allowing
 * `--from-lockfile` to skip the package-manager CLI entirely.
 */

import path from 'node:path'

export type LockfileNode = { version: string; path: string }

export type LockfileTree = {
  dependencies: Record<string, LockfileNode>
  devDependencies?: Record<string, LockfileNode>
}

export type ParseLockfileOptions = {
  cwd?: string
}

function nodeModulesPath(cwd: string, name: string): string {
  return path.join(cwd, 'node_modules', name)
}

/**
 * Parse a `package-lock.json` (npm v1 / v2 / v3) and extract the root project's
 * direct dependencies and devDependencies along with their installed versions.
 */
export function parsePackageLockJson(raw: string, opts: ParseLockfileOptions = {}): LockfileTree {
  const cwd = opts.cwd || process.cwd()
  const data = JSON.parse(raw) as Record<string, any>

  const tree: LockfileTree = { dependencies: {} }

  // npm v2/v3: top-level `packages` object with the root keyed as ''.
  const packages = data.packages as Record<string, any> | undefined
  if (packages && typeof packages === 'object') {
    const root = packages[''] || {}
    const declaredProd: Record<string, string> = root.dependencies || {}
    const declaredDev: Record<string, string> = root.devDependencies || {}

    for (const [name, spec] of Object.entries(declaredProd)) {
      const installed = packages[`node_modules/${name}`]
      const version =
        (installed && typeof installed.version === 'string' && installed.version) || spec
      tree.dependencies[name] = { version, path: nodeModulesPath(cwd, name) }
    }

    if (Object.keys(declaredDev).length > 0) {
      tree.devDependencies = {}
      for (const [name, spec] of Object.entries(declaredDev)) {
        const installed = packages[`node_modules/${name}`]
        const version =
          (installed && typeof installed.version === 'string' && installed.version) || spec
        tree.devDependencies[name] = { version, path: nodeModulesPath(cwd, name) }
      }
    }

    return tree
  }

  // npm v1: top-level `dependencies` map keyed by name with `dev` boolean.
  const legacy = data.dependencies as Record<string, any> | undefined
  if (legacy && typeof legacy === 'object') {
    for (const [name, info] of Object.entries(legacy)) {
      const version = (info && typeof info.version === 'string' && info.version) || ''
      const node: LockfileNode = { version, path: nodeModulesPath(cwd, name) }
      if (info && info.dev === true) {
        tree.devDependencies = tree.devDependencies || {}
        tree.devDependencies[name] = node
      } else {
        tree.dependencies[name] = node
      }
    }
  }

  return tree
}

/**
 * Strip trailing commas inside objects/arrays so JSON.parse can read Bun's
 * relaxed lockfile syntax. Quoted strings are preserved verbatim.
 */
function stripTrailingCommas(input: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === ',') {
      // Look ahead, skipping whitespace, for a closing brace/bracket.
      let j = i + 1
      while (j < input.length && /\s/.test(input[j] as string)) j++
      const next = input[j]
      if (next === '}' || next === ']') {
        // Drop the trailing comma.
        continue
      }
    }
    out += ch
  }
  return out
}

/**
 * Extract the version portion from a Bun package descriptor like
 * `"foo@1.2.3"` or `"@scope/pkg@1.2.3"`. Returns an empty string if the
 * descriptor cannot be parsed.
 */
function versionFromBunDescriptor(descriptor: string): string {
  // Find the LAST '@' that separates name from version, ignoring the leading
  // '@' on scoped packages.
  const start = descriptor.startsWith('@') ? 1 : 0
  const at = descriptor.indexOf('@', start)
  if (at === -1) return ''
  return descriptor.slice(at + 1)
}

/**
 * Parse a Bun text lockfile (`bun.lock`, lockfileVersion 1) and extract the
 * root workspace's direct dependencies and devDependencies.
 */
export function parseBunLockfile(raw: string, opts: ParseLockfileOptions = {}): LockfileTree {
  const cwd = opts.cwd || process.cwd()
  const cleaned = stripTrailingCommas(raw)
  const data = JSON.parse(cleaned) as Record<string, any>

  const tree: LockfileTree = { dependencies: {} }

  const workspaces = (data.workspaces as Record<string, any> | undefined) || {}
  const root = workspaces[''] || {}
  const declaredProd: Record<string, string> = root.dependencies || {}
  const declaredDev: Record<string, string> = root.devDependencies || {}
  const packages = (data.packages as Record<string, any> | undefined) || {}

  const resolveVersion = (name: string, spec: string): string => {
    const entry = packages[name]
    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      const v = versionFromBunDescriptor(entry[0])
      if (v) return v
    }
    return spec
  }

  for (const [name, spec] of Object.entries(declaredProd)) {
    tree.dependencies[name] = {
      version: resolveVersion(name, spec),
      path: nodeModulesPath(cwd, name),
    }
  }

  if (Object.keys(declaredDev).length > 0) {
    tree.devDependencies = {}
    for (const [name, spec] of Object.entries(declaredDev)) {
      tree.devDependencies[name] = {
        version: resolveVersion(name, spec),
        path: nodeModulesPath(cwd, name),
      }
    }
  }

  return tree
}
