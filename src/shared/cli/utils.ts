/**
 * @fileoverview CLI utility functions for version handling and path resolution
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Gets the path to package.json for version resolution
 */
export function getPkgJsonPath(): string {
  let startDir: string
  try {
    const __filename = fileURLToPath((import.meta as any).url)
    startDir = path.dirname(__filename)
  } catch {
    startDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd()
  }

  return findPackageJson(startDir)
}

function findPackageJson(startDir: string): string {
  let current = startDir
  const maxDepth = 6

  for (let i = 0; i < maxDepth; i++) {
    const candidate = path.resolve(current, 'package.json')
    if (existsSync(candidate)) {
      return candidate
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return path.resolve(process.cwd(), 'package.json')
}

/**
 * Gets the current tool version from package.json
 */
export async function getToolVersion(): Promise<string> {
  try {
    const pkgPath = getPkgJsonPath()
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * ASCII banner for the CLI
 */
export const ASCII_BANNER = String.raw`
  ________                __
 /  _____/  ____   _____/  |_  ____   ____
/   \  ___ /  _ \ /  _ \   __\/ __ \ /    \
\    \_\  (  <_> |  <_> )  | \  ___/|   |  \
 \______  /\____/ \____/|__|  \___  >___|  /
        \/                         \/     \/
                      GEX
`
