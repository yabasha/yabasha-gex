import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmViewDeprecated } from '../npm-cli.js'
import type { Report } from '../types.js'

import {
  applyDeprecatedCheck,
  attachDeprecatedToReport,
  buildDeprecatedEntries,
  collectReportPackages,
  fetchDeprecations,
  formatDeprecatedTable,
  handleDeprecatedWorkflow,
} from './deprecated.js'

vi.mock('../npm-cli.js', () => ({
  npmViewDeprecated: vi.fn(),
}))

const mockNpmViewDeprecated = vi.mocked(npmViewDeprecated)

describe('deprecated utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockNpmViewDeprecated.mockReset()
  })

  it('fetchDeprecations returns a name@version -> message|null map and queries by version', async () => {
    mockNpmViewDeprecated.mockImplementation(async (name: string, version?: string) => {
      if (name === 'request' && version === '2.88.2') return 'use a maintained alternative'
      if (name === 'left-pad' && version === '1.3.0') return 'no longer maintained'
      return null
    })

    const result = await fetchDeprecations([
      { name: 'request', version: '2.88.2' },
      { name: 'lodash', version: '4.17.21' },
      { name: 'left-pad', version: '1.3.0' },
    ])

    expect(result.get('request@2.88.2')).toBe('use a maintained alternative')
    expect(result.get('lodash@4.17.21')).toBeNull()
    expect(result.get('left-pad@1.3.0')).toBe('no longer maintained')
    expect(mockNpmViewDeprecated).toHaveBeenCalledTimes(3)
    expect(mockNpmViewDeprecated).toHaveBeenCalledWith('request', '2.88.2')
    expect(mockNpmViewDeprecated).toHaveBeenCalledWith('left-pad', '1.3.0')
  })

  it('fetchDeprecations batches by concurrency', async () => {
    let inFlight = 0
    let maxInFlight = 0
    mockNpmViewDeprecated.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => globalThis.setTimeout(resolve, 5))
      inFlight -= 1
      return null
    })

    const lookups = Array.from({ length: 20 }, (_, i) => ({ name: `pkg-${i}`, version: '1.0.0' }))
    await fetchDeprecations(lookups, 4)

    expect(maxInFlight).toBeLessThanOrEqual(4)
    expect(mockNpmViewDeprecated).toHaveBeenCalledTimes(20)
  })

  it('fetchDeprecations treats individual rejections as null', async () => {
    mockNpmViewDeprecated.mockImplementation(async (name: string) => {
      if (name === 'broken') throw new Error('boom')
      return null
    })

    const result = await fetchDeprecations([
      { name: 'broken', version: '1.0.0' },
      { name: 'ok', version: '1.0.0' },
    ])
    expect(result.get('broken@1.0.0')).toBeNull()
    expect(result.get('ok@1.0.0')).toBeNull()
  })

  it('fetchDeprecations distinguishes the same package at different versions', async () => {
    mockNpmViewDeprecated.mockImplementation(async (name: string, version?: string) => {
      if (name === 'pkg' && version === '1.0.0') return 'old version archived'
      if (name === 'pkg' && version === '2.0.0') return null
      return null
    })

    const result = await fetchDeprecations([
      { name: 'pkg', version: '1.0.0' },
      { name: 'pkg', version: '2.0.0' },
    ])
    expect(result.get('pkg@1.0.0')).toBe('old version archived')
    expect(result.get('pkg@2.0.0')).toBeNull()
    expect(mockNpmViewDeprecated).toHaveBeenCalledTimes(2)
  })

  it('buildDeprecatedEntries filters non-deprecated and shapes rows', () => {
    const map = new Map<string, string | null>([
      ['a@1.0.0', 'use b'],
      ['b@2.0.0', null],
      ['c@3.0.0', 'no longer maintained'],
    ])

    const entries = buildDeprecatedEntries(
      [
        { name: 'a', version: '1.0.0', type: 'prod' },
        { name: 'b', version: '2.0.0', type: 'dev' },
        { name: 'c', version: '3.0.0', type: 'prod' },
      ],
      map,
    )

    expect(entries).toEqual([
      { name: 'a', version: '1.0.0', type: 'prod', message: 'use b' },
      { name: 'c', version: '3.0.0', type: 'prod', message: 'no longer maintained' },
    ])
  })

  it('buildDeprecatedEntries dedupes the same package name across types', () => {
    const map = new Map<string, string | null>([['a@1.0.0', 'use b']])

    const entries = buildDeprecatedEntries(
      [
        { name: 'a', version: '1.0.0', type: 'prod' },
        { name: 'a', version: '1.0.0', type: 'prod' },
      ],
      map,
    )

    expect(entries).toHaveLength(1)
  })

  it('buildDeprecatedEntries does not match a different installed version', () => {
    const map = new Map<string, string | null>([['a@1.0.0', 'use b']])

    const entries = buildDeprecatedEntries([{ name: 'a', version: '2.0.0', type: 'prod' }], map)

    expect(entries).toEqual([])
  })

  it('formatDeprecatedTable renders headers and rows', () => {
    const table = formatDeprecatedTable([
      { name: 'request', version: '2.88.2', type: 'prod', message: 'see https://...' },
    ])

    expect(table).toContain('Name')
    expect(table).toContain('Version')
    expect(table).toContain('Type')
    expect(table).toContain('Reason')
    expect(table).toContain('request')
    expect(table).toContain('2.88.2')
    expect(table).toContain('see https://...')
  })

  it('handleDeprecatedWorkflow short-circuits when checkDeprecated is false', async () => {
    const fetchSpy = vi.fn(async () => new Map<string, string | null>())

    const result = await handleDeprecatedWorkflow({
      checkDeprecated: false,
      outFile: undefined,
      fetchDeprecations: fetchSpy,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.proceed).toBe(true)
    expect(result.deprecations.size).toBe(0)
  })

  it('handleDeprecatedWorkflow runs the fetcher and skips report when no outFile', async () => {
    const fetchSpy = vi.fn(async () => new Map([['a@1.0.0', 'gone']]))

    const result = await handleDeprecatedWorkflow({
      checkDeprecated: true,
      outFile: undefined,
      fetchDeprecations: fetchSpy,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.deprecations.get('a@1.0.0')).toBe('gone')
    expect(result.proceed).toBe(false)
  })

  it('handleDeprecatedWorkflow proceeds with the report when outFile is provided', async () => {
    const fetchSpy = vi.fn(async () => new Map<string, string | null>())

    const result = await handleDeprecatedWorkflow({
      checkDeprecated: true,
      outFile: 'report.md',
      fetchDeprecations: fetchSpy,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.proceed).toBe(true)
  })

  it('collectReportPackages returns unique (name, version) pairs across all sections', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [{ name: 'g1', version: '1.0.0', resolved_path: '/g1' }],
      local_dependencies: [
        { name: 'a', version: '1.0.0', resolved_path: '/a' },
        { name: 'b', version: '1.0.0', resolved_path: '/b' },
      ],
      local_dev_dependencies: [
        { name: 'a', version: '1.0.0', resolved_path: '/a' },
        { name: 'c', version: '1.0.0', resolved_path: '/c' },
      ],
    }

    const lookups = collectReportPackages(report)
    const keys = lookups.map((l) => `${l.name}@${l.version}`).sort()
    expect(keys).toEqual(['a@1.0.0', 'b@1.0.0', 'c@1.0.0', 'g1@1.0.0'])
  })

  it('collectReportPackages keeps the same package at different versions as separate lookups', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [{ name: 'pkg', version: '1.0.0', resolved_path: '/g' }],
      local_dependencies: [{ name: 'pkg', version: '2.0.0', resolved_path: '/l' }],
      local_dev_dependencies: [],
    }

    const lookups = collectReportPackages(report)
    expect(lookups.map((l) => `${l.name}@${l.version}`).sort()).toEqual(['pkg@1.0.0', 'pkg@2.0.0'])
  })

  it('attachDeprecatedToReport sets deprecated on each matching package', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [{ name: 'left-pad', version: '1', resolved_path: '/lp' }],
      local_dependencies: [
        { name: 'request', version: '2', resolved_path: '/r' },
        { name: 'lodash', version: '4', resolved_path: '/l' },
      ],
      local_dev_dependencies: [{ name: 'request', version: '2', resolved_path: '/r' }],
    }

    const deprecations = new Map<string, string | null>([
      ['request@2', 'use undici'],
      ['lodash@4', null],
      ['left-pad@1', 'one-liner of shame'],
    ])

    attachDeprecatedToReport(report, deprecations)

    expect(report.global_packages[0].deprecated).toBe('one-liner of shame')
    expect(report.local_dependencies[0].deprecated).toBe('use undici')
    expect(report.local_dependencies[1].deprecated).toBeNull()
    expect(report.local_dev_dependencies[0].deprecated).toBe('use undici')
  })

  it('attachDeprecatedToReport does not match a different installed version', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [],
      local_dependencies: [{ name: 'pkg', version: '2.0.0', resolved_path: '/p' }],
      local_dev_dependencies: [],
    }

    const deprecations = new Map<string, string | null>([['pkg@1.0.0', 'old version archived']])

    attachDeprecatedToReport(report, deprecations)

    expect(report.local_dependencies[0]).not.toHaveProperty('deprecated')
  })

  it('applyDeprecatedCheck returns { proceed: true } when checkDeprecated is false', async () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [],
      local_dependencies: [{ name: 'a', version: '1', resolved_path: '/a' }],
      local_dev_dependencies: [],
    }

    mockNpmViewDeprecated.mockResolvedValue('should-not-be-called')

    const result = await applyDeprecatedCheck(report, {
      checkDeprecated: false,
      context: 'local',
      outFile: undefined,
    })

    expect(result.proceed).toBe(true)
    expect(mockNpmViewDeprecated).not.toHaveBeenCalled()
    expect(report.local_dependencies[0]).not.toHaveProperty('deprecated')
  })

  it('applyDeprecatedCheck attaches deprecations and returns proceed=false without outFile', async () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [],
      local_dependencies: [
        { name: 'request', version: '2.0.0', resolved_path: '/r' },
        { name: 'lodash', version: '4.0.0', resolved_path: '/l' },
      ],
      local_dev_dependencies: [],
    }

    mockNpmViewDeprecated.mockImplementation(async (name: string) =>
      name === 'request' ? 'use undici' : null,
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const result = await applyDeprecatedCheck(report, {
      checkDeprecated: true,
      context: 'local',
      outFile: undefined,
    })

    expect(result.proceed).toBe(false)
    expect(report.local_dependencies[0].deprecated).toBe('use undici')
    expect(report.local_dependencies[1].deprecated).toBeNull()
    expect(logSpy).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('applyDeprecatedCheck returns proceed=true when outFile is set so the report is still written', async () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [{ name: 'left-pad', version: '1.0', resolved_path: '/lp' }],
      local_dependencies: [],
      local_dev_dependencies: [],
    }

    mockNpmViewDeprecated.mockResolvedValue('archived')

    const result = await applyDeprecatedCheck(report, {
      checkDeprecated: true,
      context: 'global',
      outFile: 'out.md',
    })

    expect(result.proceed).toBe(true)
    expect(report.global_packages[0].deprecated).toBe('archived')
  })

  it('attachDeprecatedToReport leaves packages without lookup entries untouched', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [],
      local_dependencies: [{ name: 'unknown', version: '1', resolved_path: '/u' }],
      local_dev_dependencies: [],
    }

    attachDeprecatedToReport(report, new Map())

    expect(report.local_dependencies[0]).not.toHaveProperty('deprecated')
  })
})
