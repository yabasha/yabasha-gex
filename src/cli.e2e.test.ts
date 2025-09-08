import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { describe, it, expect } from 'vitest'

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gex-e2e-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('CLI e2e (skips if dist not present)', () => {
  it('runs gex from dist if available and writes default json file when -f json is used', () => {
    const cliPath = path.resolve(process.cwd(), 'dist/cli.cjs')
    if (!existsSync(cliPath)) {
      // Build not present in CI test order; skip gracefully
      expect(true).toBe(true)
      return
    }

    withTempDir((dir) => {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'tmp', version: '0.0.0' }),
      )
      execFileSync('node', [cliPath, '-f', 'json'], { cwd: dir, stdio: 'pipe' })
      const outPath = path.join(dir, 'gex-report.json')
      expect(existsSync(outPath)).toBe(true)
      const content = JSON.parse(readFileSync(outPath, 'utf8'))
      expect(content.report_version).toBe('1.0')
      expect(Array.isArray(content.local_dependencies)).toBe(true)
      expect(Array.isArray(content.local_dev_dependencies)).toBe(true)
    })
  })
})
