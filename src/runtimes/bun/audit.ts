import { promisify } from 'node:util'

import type { AuditResult } from '../../shared/npm-cli.js'
import { parseAuditPayload } from '../../shared/npm-cli.js'

export type BunAuditOptions = {
  cwd?: string
  production?: boolean
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

export async function bunAudit(options: BunAuditOptions = {}): Promise<AuditResult> {
  const args = ['audit', '--json']
  if (options.production) args.push('--prod')
  try {
    const execFileAsync = await getExecFileAsync()
    const { stdout } = await execFileAsync('bun', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    return parseAuditPayload(stdout)
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    if (stdout.trim()) return parseAuditPayload(stdout)
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const message = stderr || error?.message || 'bun audit failed'
    throw new Error(`bun audit failed: ${message}`)
  }
}
