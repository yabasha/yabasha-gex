import { beforeEach, describe, expect, it, vi } from 'vitest'

import { npmViewDeprecated } from '../npm-cli.js'
import type { Report } from '../types.js'

import {
  applyDeprecatedCheck,
  attachDeprecatedToReport,
  buildDeprecatedEntries,
  collectReportPackageNames,
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

  it('fetchDeprecations returns a name -> message|null map', async () => {
    mockNpmViewDeprecated.mockImplementation(async (name: string) => {
      if (name === 'request') return 'use a maintained alternative'
      if (name === 'left-pad') return 'no longer maintained'
      return null
    })

    const result = await fetchDeprecations(['request', 'lodash', 'left-pad'])

    expect(result.get('request')).toBe('use a maintained alternative')
    expect(result.get('lodash')).toBeNull()
    expect(result.get('left-pad')).toBe('no longer maintained')
    expect(mockNpmViewDeprecated).toHaveBeenCalledTimes(3)
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

    const names = Array.from({ length: 20 }, (_, i) => `pkg-${i}`)
    await fetchDeprecations(names, 4)

    expect(maxInFlight).toBeLessThanOrEqual(4)
    expect(mockNpmViewDeprecated).toHaveBeenCalledTimes(20)
  })

  it('fetchDeprecations treats individual rejections as null', async () => {
    mockNpmViewDeprecated.mockImplementation(async (name: string) => {
      if (name === 'broken') throw new Error('boom')
      return null
    })

    const result = await fetchDeprecations(['broken', 'ok'])
    expect(result.get('broken')).toBeNull()
    expect(result.get('ok')).toBeNull()
  })

  it('buildDeprecatedEntries filters non-deprecated and shapes rows', () => {
    const map = new Map<string, string | null>([
      ['a', 'use b'],
      ['b', null],
      ['c', 'no longer maintained'],
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
    const map = new Map<string, string | null>([['a', 'use b']])

    const entries = buildDeprecatedEntries(
      [
        { name: 'a', version: '1.0.0', type: 'prod' },
        { name: 'a', version: '1.0.0', type: 'prod' },
      ],
      map,
    )

    expect(entries).toHaveLength(1)
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
    const fetchSpy = vi.fn(async () => new Map([['a', 'gone']]))

    const result = await handleDeprecatedWorkflow({
      checkDeprecated: true,
      outFile: undefined,
      fetchDeprecations: fetchSpy,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.deprecations.get('a')).toBe('gone')
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

  it('collectReportPackageNames returns unique names across all sections', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 'now',
      tool_version: 't',
      global_packages: [{ name: 'g1', version: '1', resolved_path: '/g1' }],
      local_dependencies: [
        { name: 'a', version: '1', resolved_path: '/a' },
        { name: 'b', version: '1', resolved_path: '/b' },
      ],
      local_dev_dependencies: [
        { name: 'a', version: '1', resolved_path: '/a' },
        { name: 'c', version: '1', resolved_path: '/c' },
      ],
    }

    const names = collectReportPackageNames(report)
    expect(names.sort()).toEqual(['a', 'b', 'c', 'g1'])
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
      ['request', 'use undici'],
      ['lodash', null],
      ['left-pad', 'one-liner of shame'],
    ])

    attachDeprecatedToReport(report, deprecations)

    expect(report.global_packages[0].deprecated).toBe('one-liner of shame')
    expect(report.local_dependencies[0].deprecated).toBe('use undici')
    expect(report.local_dependencies[1].deprecated).toBeNull()
    expect(report.local_dev_dependencies[0].deprecated).toBe('use undici')
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
