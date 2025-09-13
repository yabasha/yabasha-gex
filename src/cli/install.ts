/**
 * @fileoverview Package installation utilities for CLI
 */

import type { Report } from '../types.js'

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
export async function installFromReport(report: Report, cwd: string): Promise<void> {
  const globalPkgs = report.global_packages.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const localPkgs = report.local_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)
  const devPkgs = report.local_dev_dependencies.map((p) => `${p.name}@${p.version}`).filter(Boolean)

  if (globalPkgs.length === 0 && localPkgs.length === 0 && devPkgs.length === 0) {
    console.log('No packages to install from report.')
    return
  }

  // Acquire execFileAsync once per run to keep logs grouped, while still mockable in tests
  const execFileAsync = await getExecFileAsync()

  if (globalPkgs.length > 0) {
    console.log(`Installing global: ${globalPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', '-g', ...globalPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }

  if (localPkgs.length > 0) {
    console.log(`Installing local deps: ${localPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', ...localPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
  }

  if (devPkgs.length > 0) {
    console.log(`Installing local devDeps: ${devPkgs.join(' ')}`)
    await execFileAsync('npm', ['i', '-D', ...devPkgs], { cwd, maxBuffer: 10 * 1024 * 1024 })
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
