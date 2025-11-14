/**
 * @fileoverview Package installation utilities for CLI
 */

import type { Report } from '../types.js'

type PackageManager = 'npm' | 'bun'

export type InstallOptions = {
  cwd: string
  packageManager?: PackageManager
}

const INSTALL_COMMANDS: Record<
  PackageManager,
  { global: string[]; local: string[]; dev: string[] }
> = {
  npm: {
    global: ['i', '-g'],
    local: ['i'],
    dev: ['i', '-D'],
  },
  bun: {
    global: ['add', '-g'],
    local: ['add'],
    dev: ['add', '-d'],
  },
}

const MAX_BUFFER = 10 * 1024 * 1024

function formatSpec(pkg: { name: string; version: string }): string {
  return pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name
}

/**
 * Lazily obtain a promisified execFile so tests can mock built-ins reliably.
 */
async function getExecFileAsync(): Promise<
  (
    command: string,
    args?: readonly string[] | null,
    options?: any,
  ) => Promise<{ stdout: string; stderr: string }>
> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  return promisify(execFile) as any
}

/**
 * Installs packages from a report to the local environment
 *
 * @param report - The report containing packages to install
 * @param cwd - Current working directory for installation
 * @throws {Error} If npm installation fails
 */
export async function installFromReport(
  report: Report,
  options: InstallOptions | string,
): Promise<void> {
  const opts = typeof options === 'string' ? { cwd: options } : options
  const { cwd, packageManager = 'npm' } = opts

  const globalPkgs = report.global_packages.map(formatSpec).filter(Boolean)
  const localPkgs = report.local_dependencies.map(formatSpec).filter(Boolean)
  const devPkgs = report.local_dev_dependencies.map(formatSpec).filter(Boolean)

  if (globalPkgs.length === 0 && localPkgs.length === 0 && devPkgs.length === 0) {
    console.log('No packages to install from report.')
    return
  }

  // Acquire execFileAsync once per run to keep logs grouped, while still mockable in tests
  const execFileAsync = await getExecFileAsync()
  const cmd = INSTALL_COMMANDS[packageManager]
  const binary = packageManager === 'bun' ? 'bun' : 'npm'

  if (globalPkgs.length > 0) {
    console.log(`Installing global: ${globalPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.global, ...globalPkgs], { cwd, maxBuffer: MAX_BUFFER })
  }

  if (localPkgs.length > 0) {
    console.log(`Installing local deps: ${localPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.local, ...localPkgs], { cwd, maxBuffer: MAX_BUFFER })
  }

  if (devPkgs.length > 0) {
    console.log(`Installing local devDeps: ${devPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.dev, ...devPkgs], { cwd, maxBuffer: MAX_BUFFER })
  }
}

/**
 * Prints packages from a report to the console
 *
 * @param report - The report to print packages from
 */
export function printFromReport(report: Report): void {
  const lines: string[] = []

  if (report.global_packages.length > 0) {
    lines.push('Global Packages:')
    for (const p of report.global_packages) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }

  if (report.local_dependencies.length > 0) {
    if (lines.length) lines.push('')
    lines.push('Local Dependencies:')
    for (const p of report.local_dependencies) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }

  if (report.local_dev_dependencies.length > 0) {
    if (lines.length) lines.push('')
    lines.push('Local Dev Dependencies:')
    for (const p of report.local_dev_dependencies) {
      lines.push(`- ${p.name}@${p.version}`)
    }
  }

  if (lines.length === 0) {
    lines.push('(no packages found in report)')
  }

  console.log(lines.join('\n'))
}
