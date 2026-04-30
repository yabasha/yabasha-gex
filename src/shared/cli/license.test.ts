import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Report } from '../types.js'

import {
  enrichReportWithLicenses,
  findLicenseViolations,
  normalizeLicense,
  parseLicenseField,
  splitSpdxExpression,
} from './license.js'

const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}))

describe('parseLicenseField', () => {
  it('returns the license string when given a plain string', () => {
    expect(parseLicenseField({ license: 'MIT' })).toBe('MIT')
  })

  it('returns UNKNOWN when no license field is present', () => {
    expect(parseLicenseField({})).toBe('UNKNOWN')
    expect(parseLicenseField(null)).toBe('UNKNOWN')
    expect(parseLicenseField(undefined)).toBe('UNKNOWN')
  })

  it('extracts type from legacy { type, url } object form', () => {
    expect(parseLicenseField({ license: { type: 'MIT', url: 'https://...' } })).toBe('MIT')
  })

  it('joins multiple licenses from the legacy plural array form into an OR expression', () => {
    const pkg = {
      licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
    }
    expect(parseLicenseField(pkg)).toBe('(MIT OR Apache-2.0)')
  })

  it('preserves SPDX expressions like "(MIT OR Apache-2.0)"', () => {
    expect(parseLicenseField({ license: '(MIT OR Apache-2.0)' })).toBe('(MIT OR Apache-2.0)')
  })

  it('returns UNKNOWN when license has no recognizable shape', () => {
    expect(parseLicenseField({ license: 42 })).toBe('UNKNOWN')
    expect(parseLicenseField({ license: {} })).toBe('UNKNOWN')
  })
})

describe('normalizeLicense', () => {
  it('lowercases and trims the license string', () => {
    expect(normalizeLicense('  MIT  ')).toBe('mit')
    expect(normalizeLicense('Apache-2.0')).toBe('apache-2.0')
  })

  it('strips outer parentheses from SPDX expressions', () => {
    expect(normalizeLicense('(MIT OR Apache-2.0)')).toBe('mit or apache-2.0')
  })
})

describe('splitSpdxExpression', () => {
  it('returns a single license unchanged', () => {
    expect(splitSpdxExpression('MIT')).toEqual(['MIT'])
  })

  it('splits an OR expression', () => {
    expect(splitSpdxExpression('(MIT OR Apache-2.0)')).toEqual(['MIT', 'Apache-2.0'])
  })

  it('splits an AND expression', () => {
    expect(splitSpdxExpression('(MIT AND Apache-2.0)')).toEqual(['MIT', 'Apache-2.0'])
  })

  it('splits mixed AND/OR by treating both as separators', () => {
    expect(splitSpdxExpression('(MIT OR Apache-2.0 AND BSD-3-Clause)')).toEqual([
      'MIT',
      'Apache-2.0',
      'BSD-3-Clause',
    ])
  })

  it('handles UNKNOWN as a single-entry list', () => {
    expect(splitSpdxExpression('UNKNOWN')).toEqual(['UNKNOWN'])
  })
})

function reportFixture(): Report {
  return {
    report_version: '1.0',
    timestamp: '2025-01-01T00:00:00.000Z',
    tool_version: '0.0.0',
    global_packages: [],
    local_dependencies: [
      { name: 'foo', version: '1.0.0', resolved_path: '/repo/node_modules/foo' },
      { name: 'bar', version: '2.0.0', resolved_path: '/repo/node_modules/bar' },
    ],
    local_dev_dependencies: [
      { name: 'devthing', version: '3.0.0', resolved_path: '/repo/node_modules/devthing' },
    ],
  }
}

describe('enrichReportWithLicenses', () => {
  beforeEach(() => {
    mockReadFile.mockReset()
  })

  it('reads each package.json and writes a license field on each entry', async () => {
    const manifests: Record<string, any> = {
      '/repo/node_modules/foo/package.json': { license: 'MIT' },
      '/repo/node_modules/bar/package.json': { license: { type: 'Apache-2.0' } },
      '/repo/node_modules/devthing/package.json': { licenses: [{ type: 'BSD-3-Clause' }] },
    }
    mockReadFile.mockImplementation(async (file: string) => {
      if (manifests[file]) return JSON.stringify(manifests[file])
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const enriched = await enrichReportWithLicenses(reportFixture())
    expect(enriched.local_dependencies[0].license).toBe('MIT')
    expect(enriched.local_dependencies[1].license).toBe('Apache-2.0')
    expect(enriched.local_dev_dependencies[0].license).toBe('BSD-3-Clause')
  })

  it('writes UNKNOWN when a package.json is missing or malformed', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const enriched = await enrichReportWithLicenses(reportFixture())
    for (const p of enriched.local_dependencies) expect(p.license).toBe('UNKNOWN')
  })
})

function setAllLicenses(report: Report, license: string): Report {
  for (const p of report.local_dependencies) p.license = license
  for (const p of report.local_dev_dependencies) p.license = license
  return report
}

describe('findLicenseViolations', () => {
  it('returns nothing when every license is in the allowlist', () => {
    const report = reportFixture()
    report.local_dependencies[0].license = 'MIT'
    report.local_dependencies[1].license = 'Apache-2.0'
    report.local_dev_dependencies[0].license = 'MIT'

    expect(findLicenseViolations(report, ['MIT', 'Apache-2.0'])).toEqual([])
  })

  it('flags packages whose license is not in the allowlist', () => {
    const report = setAllLicenses(reportFixture(), 'MIT')
    report.local_dependencies[1].license = 'GPL-3.0'

    const violations = findLicenseViolations(report, ['MIT'])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      name: 'bar',
      license: 'GPL-3.0',
      section: 'dependencies',
    })
  })

  it('treats SPDX OR expressions as satisfied if any part is allowed', () => {
    const report = setAllLicenses(reportFixture(), 'MIT')
    report.local_dependencies[0].license = '(MIT OR GPL-3.0)'

    expect(findLicenseViolations(report, ['MIT'])).toEqual([])
  })

  it('treats SPDX AND expressions as violating when any part is not allowed', () => {
    const report = setAllLicenses(reportFixture(), 'MIT')
    report.local_dependencies[0].license = '(MIT AND GPL-3.0)'

    const violations = findLicenseViolations(report, ['MIT'])
    expect(violations).toHaveLength(1)
    expect(violations[0].name).toBe('foo')
  })

  it('flags UNKNOWN licenses as violations regardless of allowlist', () => {
    const report = setAllLicenses(reportFixture(), 'MIT')
    report.local_dependencies[0].license = 'UNKNOWN'

    const violations = findLicenseViolations(report, ['UNKNOWN', 'MIT'])
    expect(violations).toHaveLength(1)
    expect(violations[0].license).toBe('UNKNOWN')
  })

  it('matches allowlist entries case-insensitively', () => {
    const report = reportFixture()
    report.local_dependencies[0].license = 'mit'
    report.local_dependencies[1].license = 'Apache-2.0'
    report.local_dev_dependencies[0].license = 'MIT'

    expect(findLicenseViolations(report, ['MIT', 'apache-2.0'])).toEqual([])
  })
})
