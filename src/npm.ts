import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type NpmLsOptions = {
  global?: boolean
  omitDev?: boolean
  depth0?: boolean
  cwd?: string
}

export async function npmLs(options: NpmLsOptions = {}): Promise<any> {
  const args = ['ls', '--json']
  if (options.global) args.push('--global')
  if (options.omitDev) args.push('--omit=dev')
  if (options.depth0) args.push('--depth=0')

  try {
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
      } catch {
        // fallthrough
      }
    }
    const stderr = err?.stderr
    const msg = (typeof stderr === 'string' && stderr.trim()) || err?.message || 'npm ls failed'
    throw new Error(`npm ls failed: ${msg}`)
  }
}

export async function npmRootGlobal(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('npm', ['root', '-g'])
    return stdout.trim()
  } catch (err: any) {
    const stderr = err?.stderr
    const msg =
      (typeof stderr === 'string' && stderr.trim()) || err?.message || 'npm root -g failed'
    throw new Error(`npm root -g failed: ${msg}`)
  }
}
