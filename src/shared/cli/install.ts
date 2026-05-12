/**
 * @fileoverview Package installation utilities for CLI
 */

import type { Report } from '../types.js'
import { validateAndFormatPackageSpec } from '../validators.js'

type PackageManager = 'npm' | 'bun' | 'yarn' | 'pnpm'

export type InstallOptions = {
  cwd: string
  packageManager?: PackageManager
  /**
   * Opt in to running lifecycle scripts (preinstall/postinstall) of installed packages.
   * Off by default — reports may originate from untrusted sources, and a malicious
   * package name + install scripts is a one-shot RCE on the developer machine.
   */
  allowScripts?: boolean
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
  yarn: {
    global: ['global', 'add'],
    local: ['add'],
    dev: ['add', '-D'],
  },
  pnpm: {
    global: ['add', '-g'],
    local: ['add'],
    dev: ['add', '-D'],
  },
}

const MAX_BUFFER = 10 * 1024 * 1024

/**
 * Build environment variables that suppress lifecycle scripts even on package
 * managers that silently ignore the `--ignore-scripts` CLI flag.
 *
 * - Yarn Berry (v2+) does not accept `--ignore-scripts` at all; it gates scripts
 *   via `enableScripts` in .yarnrc.yml or the YARN_ENABLE_SCRIPTS env var.
 * - npm / pnpm respect both the CLI flag and `npm_config_ignore_scripts`; we set
 *   the env var as defense-in-depth in case the flag is dropped or unrecognized
 *   on a future subcommand (e.g. pnpm global modes whose flag support is fuzzy).
 * - bun honors the CLI flag.
 *
 * Returns undefined when the caller has opted into running scripts, so
 * `process.env` is left intact.
 */
function buildSafetyEnv(allowScripts: boolean): Record<string, string | undefined> | undefined {
  if (allowScripts) return undefined
  return {
    ...process.env,
    npm_config_ignore_scripts: 'true',
    YARN_ENABLE_SCRIPTS: 'false',
  }
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
  const { cwd, packageManager = 'npm', allowScripts = false } = opts

  const globalPkgs = report.global_packages.map(validateAndFormatPackageSpec).filter(Boolean)
  const localPkgs = report.local_dependencies.map(validateAndFormatPackageSpec).filter(Boolean)
  const devPkgs = report.local_dev_dependencies.map(validateAndFormatPackageSpec).filter(Boolean)

  if (globalPkgs.length === 0 && localPkgs.length === 0 && devPkgs.length === 0) {
    console.log('No packages to install from report.')
    return
  }

  // Acquire execFileAsync once per run to keep logs grouped, while still mockable in tests
  const execFileAsync = await getExecFileAsync()
  const cmd = INSTALL_COMMANDS[packageManager]
  const binary = packageManager === 'npm' ? 'npm' : packageManager
  // CLI flag covers npm / bun / pnpm / Yarn Classic. Env-var fallback covers
  // Yarn Berry (which silently ignores the flag) and acts as defense-in-depth
  // for npm/pnpm subcommands that may not honor the flag.
  const safetyFlags = allowScripts ? [] : ['--ignore-scripts']
  const safetyEnv = buildSafetyEnv(allowScripts)
  const execOptions = { cwd, maxBuffer: MAX_BUFFER, ...(safetyEnv ? { env: safetyEnv } : {}) }

  if (globalPkgs.length > 0) {
    console.log(`Installing global: ${globalPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.global, ...safetyFlags, ...globalPkgs], execOptions)
  }

  if (localPkgs.length > 0) {
    console.log(`Installing local deps: ${localPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.local, ...safetyFlags, ...localPkgs], execOptions)
  }

  if (devPkgs.length > 0) {
    console.log(`Installing local devDeps: ${devPkgs.join(' ')}`)
    await execFileAsync(binary, [...cmd.dev, ...safetyFlags, ...devPkgs], execOptions)
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
