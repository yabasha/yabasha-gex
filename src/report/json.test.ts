import { describe, it, expect } from 'vitest'

import type { Report } from '../types.js'

import { renderJson } from './json.js'

describe('renderJson', () => {
  it('sorts arrays deterministically by name', () => {
    const rpt: Report = {
      report_version: '1.0',
      timestamp: new Date().toISOString(),
      tool_version: '0.1.0',
      global_packages: [
        { name: 'zeta', version: '1.0.0', resolved_path: '/z' },
        { name: 'alpha', version: '1.0.0', resolved_path: '/a' },
      ],
      local_dependencies: [
        { name: 'b', version: '1', resolved_path: '/b' },
        { name: 'a', version: '1', resolved_path: '/a' },
      ],
      local_dev_dependencies: [
        { name: 'd', version: '1', resolved_path: '/d' },
        { name: 'c', version: '1', resolved_path: '/c' },
      ],
    }
    const out = renderJson(rpt)
    const parsed = JSON.parse(out)
    expect(parsed.global_packages.map((p: any) => p.name)).toEqual(['alpha', 'zeta'])
    expect(parsed.local_dependencies.map((p: any) => p.name)).toEqual(['a', 'b'])
    expect(parsed.local_dev_dependencies.map((p: any) => p.name)).toEqual(['c', 'd'])
  })
})
