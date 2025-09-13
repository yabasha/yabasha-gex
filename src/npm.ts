/**
 * @fileoverview npm command execution utilities for dependency analysis
 */

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
 * Options for npm ls command execution
 */
export type NpmLsOptions = {
  /** Whether to list global packages */
  global?: boolean
  /** Whether to omit devDependencies */
  omitDev?: boolean
  /** Whether to use depth=0 for faster execution */
  depth0?: boolean
  /** Current working directory for command execution */
  cwd?: string
}

/**
 * Executes npm ls command and returns parsed dependency tree
 *
 * @param options - Configuration options for npm ls command
 * @returns Promise resolving to npm dependency tree object
 * @throws {Error} If npm command fails or output cannot be parsed
 *
 * @example
 * ```typescript
 * import { npmLs } from './npm.js'
 *
 * // Get local dependencies with devDependencies omitted
 * const tree = await npmLs({ omitDev: true, depth0: true })
 *
 * // Get global packages
 * const globalTree = await npmLs({ global: true })
 * ```
 */
export async function npmLs(options: NpmLsOptions = {}): Promise<any> {
  const args = ['ls', '--json']
  if (options.global) args.push('--global')
  if (options.omitDev) args.push('--omit=dev')
  if (options.depth0) args.push('--depth=0')

  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('npm', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (stdout && stdout.trim()) return JSON.parse(stdout)
    return {}
  } catch (err: any) {
    const stdout = err?.stdout
    if (typeof stdout === 'string' && stdout.trim()) {
      try {
        return JSON.parse(stdout)
      } catch (parseErr) {
        if (process.env.DEBUG?.includes('gex')) {
          console.warn('npm ls stdout parse failed:', parseErr)
        }
      }
    }
    const stderr = err?.stderr
    const msg = (typeof stderr === 'string' && stderr.trim()) || err?.message || 'npm ls failed'
    throw new Error(`npm ls failed: ${msg}`)
  }
}

/**
 * Gets the global npm root directory path
 *
 * @returns Promise resolving to the global npm root path
 * @throws {Error} If npm root -g command fails
 *
 * @example
 * ```typescript
 * import { npmRootGlobal } from './npm.js'
 *
 * try {
 *   const globalRoot = await npmRootGlobal()
 *   console.log('Global npm root:', globalRoot)
 * } catch (error) {
 *   console.error('Failed to get global root:', error.message)
 * }
 * ```
 */
export async function npmRootGlobal(): Promise<string> {
  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('npm', ['root', '-g'])
    return stdout.trim()
  } catch (err: any) {
    const stderr = err?.stderr
    const msg =
      (typeof stderr === 'string' && stderr.trim()) || err?.message || 'npm root -g failed'
    throw new Error(`npm root -g failed: ${msg}`)
  }
}
