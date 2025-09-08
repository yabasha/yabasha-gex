import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { describe, it, expect } from 'vitest'

import { buildReportFromNpmTree } from './transform.js'

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gex-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('buildReportFromNpmTree', () => {
  it('categorizes local deps and devDeps and includes project metadata', async () => {
    await new Promise<void>((resolve) => {
      withTempDir(async (dir) => {
        writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify(
            { name: 'my-app', version: '1.2.3', devDependencies: { vitest: '^2.1.1' } },
            null,
            2,
          ),
          'utf8',
        )
        const tree = {
          dependencies: {
            commander: { version: '12.1.0', path: path.join(dir, 'node_modules/commander') },
            vitest: { version: '2.1.1', path: path.join(dir, 'node_modules/vitest') },
          },
        }
        const rpt = await buildReportFromNpmTree(tree, {
          context: 'local',
          includeTree: false,
          omitDev: false,
          cwd: dir,
          toolVersion: '0.1.0',
        })
        expect(rpt.project_name).toBe('my-app')
        expect(rpt.project_version).toBe('1.2.3')
        expect(rpt.local_dependencies.map((p) => p.name)).toEqual(['commander'])
        expect(rpt.local_dev_dependencies.map((p) => p.name)).toEqual(['vitest'])
        expect(rpt.global_packages.length).toBe(0)
        resolve()
      })
    })
  })

  it('normalizes global deps using globalRoot when path is absent', async () => {
    const tree = {
      dependencies: {
        'http-server': { version: '14.1.1' },
      },
    }
    const rpt = await buildReportFromNpmTree(tree, {
      context: 'global',
      includeTree: false,
      omitDev: false,
      toolVersion: '0.1.0',
      globalRoot: '/opt/npm-global/lib/node_modules',
    })
    expect(rpt.global_packages[0]).toEqual({
      name: 'http-server',
      version: '14.1.1',
      resolved_path: '/opt/npm-global/lib/node_modules/http-server',
    })
  })
})
