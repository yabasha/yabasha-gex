import { describe, expect, it } from 'vitest'

import type { Report } from '../types.js'

import { diffReports, formatDiffMarkdown, formatDiffSummary } from './diff.js'

function emptyReport(overrides: Partial<Report> = {}): Report {
  return {
    report_version: '1.0',
    timestamp: '2025-01-01T00:00:00.000Z',
    tool_version: '0.0.0',
    global_packages: [],
    local_dependencies: [],
    local_dev_dependencies: [],
    ...overrides,
  }
}

function pkg(name: string, version: string) {
  return { name, version, resolved_path: '' }
}

describe('diffReports', () => {
  it('detects added local dependencies', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })
    const next = emptyReport({
      local_dependencies: [pkg('axios', '1.0.0'), pkg('zod', '3.22.0')],
    })

    const diff = diffReports(old, next)

    expect(diff.local_dependencies.added).toEqual([pkg('zod', '3.22.0')])
    expect(diff.local_dependencies.removed).toEqual([])
    expect(diff.local_dependencies.upgraded).toEqual([])
    expect(diff.local_dependencies.downgraded).toEqual([])
  })

  it('detects removed local dependencies', () => {
    const old = emptyReport({
      local_dependencies: [pkg('axios', '1.0.0'), pkg('zod', '3.22.0')],
    })
    const next = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })

    const diff = diffReports(old, next)

    expect(diff.local_dependencies.removed).toEqual([pkg('zod', '3.22.0')])
    expect(diff.local_dependencies.added).toEqual([])
  })

  it('detects upgraded versions', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })
    const next = emptyReport({ local_dependencies: [pkg('axios', '1.6.0')] })

    const diff = diffReports(old, next)

    expect(diff.local_dependencies.upgraded).toEqual([
      { name: 'axios', from: '1.0.0', to: '1.6.0' },
    ])
    expect(diff.local_dependencies.downgraded).toEqual([])
  })

  it('detects downgraded versions', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.6.0')] })
    const next = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })

    const diff = diffReports(old, next)

    expect(diff.local_dependencies.downgraded).toEqual([
      { name: 'axios', from: '1.6.0', to: '1.0.0' },
    ])
    expect(diff.local_dependencies.upgraded).toEqual([])
  })

  it('treats prerelease bumps as upgrades by semver order', () => {
    const old = emptyReport({ local_dependencies: [pkg('foo', '1.0.0-alpha.1')] })
    const next = emptyReport({ local_dependencies: [pkg('foo', '1.0.0')] })

    const diff = diffReports(old, next)
    expect(diff.local_dependencies.upgraded).toHaveLength(1)
  })

  it('falls back to lexicographic comparison for non-semver versions', () => {
    const old = emptyReport({ local_dependencies: [pkg('foo', 'a')] })
    const next = emptyReport({ local_dependencies: [pkg('foo', 'b')] })

    const diff = diffReports(old, next)
    expect(diff.local_dependencies.upgraded).toEqual([{ name: 'foo', from: 'a', to: 'b' }])
  })

  it('surfaces version-string changes that tie on semver precedence', () => {
    const old = emptyReport({ local_dependencies: [pkg('foo', '1.2.3+build1')] })
    const next = emptyReport({ local_dependencies: [pkg('foo', '1.2.3+build2')] })

    const diff = diffReports(old, next)
    const changes = [...diff.local_dependencies.upgraded, ...diff.local_dependencies.downgraded]
    expect(changes).toEqual([{ name: 'foo', from: '1.2.3+build1', to: '1.2.3+build2' }])
    expect(diff.totals.added + diff.totals.removed).toBe(0)
  })

  it('does not list packages with identical versions', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })
    const next = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })

    const diff = diffReports(old, next)
    expect(diff.local_dependencies.added).toEqual([])
    expect(diff.local_dependencies.removed).toEqual([])
    expect(diff.local_dependencies.upgraded).toEqual([])
    expect(diff.local_dependencies.downgraded).toEqual([])
  })

  it('diffs all three sections independently', () => {
    const old = emptyReport({
      global_packages: [pkg('typescript', '5.0.0')],
      local_dependencies: [pkg('axios', '1.0.0')],
      local_dev_dependencies: [pkg('vitest', '2.0.0')],
    })
    const next = emptyReport({
      global_packages: [pkg('typescript', '5.6.0')],
      local_dependencies: [pkg('zod', '3.22.0')],
      local_dev_dependencies: [],
    })

    const diff = diffReports(old, next)

    expect(diff.global_packages.upgraded).toEqual([
      { name: 'typescript', from: '5.0.0', to: '5.6.0' },
    ])
    expect(diff.local_dependencies.added).toEqual([pkg('zod', '3.22.0')])
    expect(diff.local_dependencies.removed).toEqual([pkg('axios', '1.0.0')])
    expect(diff.local_dev_dependencies.removed).toEqual([pkg('vitest', '2.0.0')])
  })

  it('exposes total counts', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })
    const next = emptyReport({
      local_dependencies: [pkg('axios', '1.6.0'), pkg('zod', '3.22.0')],
    })

    const diff = diffReports(old, next)
    expect(diff.totals).toEqual({ added: 1, removed: 0, upgraded: 1, downgraded: 0 })
  })
})

describe('formatDiffSummary', () => {
  it('reports no changes for an empty diff', () => {
    const diff = diffReports(emptyReport(), emptyReport())
    expect(formatDiffSummary(diff)).toBe('No changes')
  })

  it('summarizes counts in a single line', () => {
    const old = emptyReport({ local_dependencies: [pkg('axios', '1.0.0')] })
    const next = emptyReport({
      local_dependencies: [pkg('axios', '1.6.0'), pkg('zod', '3.22.0')],
    })
    const diff = diffReports(old, next)
    expect(formatDiffSummary(diff)).toBe('1 added, 0 removed, 1 upgraded, 0 downgraded')
  })
})

describe('formatDiffMarkdown', () => {
  it('renders an empty diff as a no-changes section', () => {
    const diff = diffReports(emptyReport(), emptyReport())
    const md = formatDiffMarkdown(diff)
    expect(md).toContain('# GEX Diff')
    expect(md.startsWith('# GEX Report')).toBe(false)
    expect(md).toContain('_No changes_')
  })

  it('renders sections with appropriate tables', () => {
    const old = emptyReport({
      local_dependencies: [pkg('axios', '1.0.0'), pkg('to-remove', '0.1.0')],
      local_dev_dependencies: [pkg('vitest', '2.0.0')],
    })
    const next = emptyReport({
      local_dependencies: [pkg('axios', '1.6.0'), pkg('zod', '3.22.0')],
      local_dev_dependencies: [pkg('vitest', '2.0.0')],
    })

    const diff = diffReports(old, next)
    const md = formatDiffMarkdown(diff)

    expect(md).toContain('## Local Dependencies')
    expect(md).toContain('### Added')
    expect(md).toContain('| zod | 3.22.0 |')
    expect(md).toContain('### Removed')
    expect(md).toContain('| to-remove | 0.1.0 |')
    expect(md).toContain('### Upgraded')
    expect(md).toContain('| axios | 1.0.0 | 1.6.0 |')

    expect(md).not.toContain('## Local Dev Dependencies')
    expect(md).not.toContain('## Global Packages')
  })
})
