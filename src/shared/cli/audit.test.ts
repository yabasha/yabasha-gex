import { describe, expect, it } from 'vitest'

import type { NpmAuditRaw } from '../npm-cli.js'
import type { BunAuditRaw } from '../../runtimes/bun/package-manager.js'
import type { Report } from '../types.js'

import {
  attachAuditToReport,
  formatAuditTable,
  normalizeNpmAudit,
  normalizeBunAudit,
  parseFailOn,
  runAuditWorkflow,
  severityAtOrAbove,
} from './audit.js'

describe('severityAtOrAbove', () => {
  const counts = { info: 1, low: 2, moderate: 3, high: 4, critical: 5 }

  it('counts entries at or above threshold', () => {
    expect(severityAtOrAbove(counts, 'critical')).toBe(5)
    expect(severityAtOrAbove(counts, 'high')).toBe(9)
    expect(severityAtOrAbove(counts, 'moderate')).toBe(12)
    expect(severityAtOrAbove(counts, 'low')).toBe(14)
    expect(severityAtOrAbove(counts, 'info')).toBe(15)
  })

  it('returns 0 when all counts are zero', () => {
    const zero = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
    expect(severityAtOrAbove(zero, 'low')).toBe(0)
  })
})

describe('normalizeNpmAudit', () => {
  it('emits one Vulnerability per advisory in the via list', () => {
    const raw: NpmAuditRaw = {
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'high',
          via: [
            {
              source: 1065,
              name: 'lodash',
              dependency: 'lodash',
              title: 'Prototype Pollution',
              url: 'https://github.com/advisories/GHSA-xxxx',
              severity: 'high',
              range: '<4.17.21',
            },
          ],
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
        dependencies: { prod: 10, dev: 5, optional: 0, peer: 0, peerOptional: 0, total: 15 },
      },
    }

    const { summary, vulns } = normalizeNpmAudit(raw)
    expect(vulns).toEqual([
      {
        id: '1065',
        package: 'lodash',
        severity: 'high',
        range: '<4.17.21',
        title: 'Prototype Pollution',
        url: 'https://github.com/advisories/GHSA-xxxx',
      },
    ])
    expect(summary.counts).toEqual({ info: 0, low: 0, moderate: 0, high: 1, critical: 0 })
    expect(summary.total).toBe(1)
    expect(summary.dependencies).toEqual({
      prod: 10,
      dev: 5,
      optional: 0,
      peer: 0,
      peerOptional: 0,
      total: 15,
    })
  })

  it('skips string entries in via (transitive parent refs)', () => {
    const raw: NpmAuditRaw = {
      vulnerabilities: {
        downstream: {
          name: 'downstream',
          severity: 'low',
          via: ['some-parent-package'],
        },
      },
    }
    const { vulns, summary } = normalizeNpmAudit(raw)
    expect(vulns).toEqual([])
    expect(summary.total).toBe(0)
  })

  it('coerces unknown severities to info', () => {
    const raw: NpmAuditRaw = {
      vulnerabilities: {
        weird: {
          name: 'weird',
          severity: 'extreme',
          via: [{ source: 9, title: 't', url: '', severity: 'extreme', range: '*' }],
        },
      },
    }
    const { vulns } = normalizeNpmAudit(raw)
    expect(vulns[0].severity).toBe('info')
  })

  it('deduplicates the same advisory id within one package', () => {
    const raw: NpmAuditRaw = {
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'high',
          via: [
            { source: 1065, name: 'lodash', title: 't', url: 'u', severity: 'high', range: '<1' },
            { source: 1065, name: 'lodash', title: 't', url: 'u', severity: 'high', range: '<1' },
          ],
        },
      },
    }
    const { vulns } = normalizeNpmAudit(raw)
    expect(vulns).toHaveLength(1)
  })

  it('handles empty input', () => {
    const { summary, vulns } = normalizeNpmAudit({})
    expect(vulns).toEqual([])
    expect(summary.counts).toEqual({ info: 0, low: 0, moderate: 0, high: 0, critical: 0 })
    expect(summary.total).toBe(0)
    expect(summary.dependencies).toBeUndefined()
  })
})

describe('normalizeBunAudit', () => {
  it('emits one Vulnerability per advisory entry', () => {
    const raw: BunAuditRaw = {
      lodash: [
        {
          id: 1065,
          github_advisory_id: 'GHSA-xxxx-xxxx-xxxx',
          severity: 'high',
          title: 'Prototype Pollution',
          url: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx',
          vulnerable_versions: '<4.17.21',
          module_name: 'lodash',
          cves: ['CVE-2020-8203'],
        },
      ],
    }

    const { summary, vulns } = normalizeBunAudit(raw)
    expect(vulns).toEqual([
      {
        id: 'GHSA-xxxx-xxxx-xxxx',
        package: 'lodash',
        severity: 'high',
        range: '<4.17.21',
        title: 'Prototype Pollution',
        url: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx',
        ghsa: 'GHSA-xxxx-xxxx-xxxx',
        cve: 'CVE-2020-8203',
      },
    ])
    expect(summary.counts.high).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.dependencies).toBeUndefined()
  })

  it('falls back to numeric id when no GHSA id is present', () => {
    const raw: BunAuditRaw = {
      pkg: [{ id: 42, severity: 'low', title: 't', url: 'u', vulnerable_versions: '<1' }],
    }
    const { vulns } = normalizeBunAudit(raw)
    expect(vulns[0].id).toBe('42')
  })

  it('handles empty input', () => {
    const { summary, vulns } = normalizeBunAudit({})
    expect(vulns).toEqual([])
    expect(summary.total).toBe(0)
  })
})

describe('runAuditWorkflow', () => {
  const successResult = {
    summary: {
      counts: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
      total: 1,
    },
    vulns: [
      {
        id: '1',
        package: 'p',
        severity: 'high' as const,
        range: '<1',
        title: 't',
        url: 'u',
      },
    ],
  }

  it('returns normalized data when audit succeeds and shouldFail=false without failOn', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => ({}),
      normalize: () => successResult,
    })
    expect(result.summary).toEqual(successResult.summary)
    expect(result.vulns).toEqual(successResult.vulns)
    expect(result.shouldFail).toBe(false)
  })

  it('shouldFail=true when threshold met', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => ({}),
      normalize: () => successResult,
      failOn: 'high',
    })
    expect(result.shouldFail).toBe(true)
  })

  it('shouldFail=false when below threshold', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => ({}),
      normalize: () => successResult,
      failOn: 'critical',
    })
    expect(result.shouldFail).toBe(false)
  })

  it('soft-fails on runAudit error: error captured, vulns empty, shouldFail=false without failOn', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => {
        throw new Error('network down')
      },
      normalize: () => {
        throw new Error('should not be called')
      },
    })
    expect(result.summary.error).toBe('network down')
    expect(result.summary.total).toBe(0)
    expect(result.summary.counts).toEqual({ info: 0, low: 0, moderate: 0, high: 0, critical: 0 })
    expect(result.vulns).toEqual([])
    expect(result.shouldFail).toBe(false)
  })

  it('soft-fails when normalize throws after successful runAudit', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => ({}),
      normalize: () => {
        throw new Error('bad shape')
      },
    })
    expect(result.summary.error).toBe('bad shape')
    expect(result.vulns).toEqual([])
    expect(result.shouldFail).toBe(false)
  })

  it('soft-fails with a fallback message when a non-Error value is thrown', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => {
        throw { code: 'ENOTFOUND' }
      },
      normalize: () => ({
        summary: { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, total: 0 },
        vulns: [],
      }),
    })
    expect(result.summary.error).toBe('audit failed')
  })

  it('soft-fail with failOn set: shouldFail=true', async () => {
    const result = await runAuditWorkflow({
      runAudit: async () => {
        throw new Error('network down')
      },
      normalize: () => ({
        summary: { counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, total: 0 },
        vulns: [],
      }),
      failOn: 'low',
    })
    expect(result.summary.error).toBe('network down')
    expect(result.shouldFail).toBe(true)
  })
})

describe('parseFailOn', () => {
  it('returns the severity when valid', () => {
    expect(parseFailOn('low')).toBe('low')
    expect(parseFailOn('MODERATE')).toBe('moderate')
    expect(parseFailOn('high')).toBe('high')
    expect(parseFailOn('critical')).toBe('critical')
  })

  it('returns undefined for empty input', () => {
    expect(parseFailOn(undefined)).toBeUndefined()
    expect(parseFailOn(null)).toBeUndefined()
    expect(parseFailOn('')).toBeUndefined()
  })

  it('echoes the offending value in the error', () => {
    expect(() => parseFailOn('extreme')).toThrow(/Invalid --fail-on value: extreme/)
    expect(() => parseFailOn(42 as unknown)).toThrow(/Invalid --fail-on value: 42/)
  })

  it('throws on invalid value', () => {
    expect(() => parseFailOn('extreme')).toThrow(/Invalid --fail-on/)
    expect(() => parseFailOn('info')).toThrow(/Invalid --fail-on/)
    expect(() => parseFailOn(42 as unknown)).toThrow(/Invalid --fail-on/)
  })
})

describe('attachAuditToReport', () => {
  it('mutates report with summary and vulnerabilities', () => {
    const report: Report = {
      report_version: '1.0',
      timestamp: 't',
      tool_version: 'v',
      global_packages: [],
      local_dependencies: [],
      local_dev_dependencies: [],
    }
    const summary = {
      counts: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
      total: 1,
    }
    const vulns = [
      {
        id: 'GHSA-1',
        package: 'p',
        severity: 'high' as const,
        range: '<1',
        title: 't',
        url: 'u',
      },
    ]
    attachAuditToReport(report, { summary, vulns })
    expect(report.audit_summary).toEqual(summary)
    expect(report.vulnerabilities).toEqual(vulns)
  })
})

describe('formatAuditTable', () => {
  it('renders error line when summary has error', () => {
    const out = formatAuditTable([], {
      counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      total: 0,
      error: 'boom',
    })
    expect(out).toContain('boom')
  })

  it('renders "no vulnerabilities" when empty', () => {
    const out = formatAuditTable([], {
      counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      total: 0,
    })
    expect(out.toLowerCase()).toContain('no vulnerabilities')
  })

  it('renders summary line and rows sorted critical first', () => {
    const vulns = [
      {
        id: '1',
        package: 'a',
        severity: 'low' as const,
        range: '<1',
        title: 'low one',
        url: '',
      },
      {
        id: '2',
        package: 'b',
        severity: 'critical' as const,
        range: '<2',
        title: 'crit one',
        url: '',
      },
    ]
    const out = formatAuditTable(vulns, {
      counts: { info: 0, low: 1, moderate: 0, high: 0, critical: 1 },
      total: 2,
    })
    expect(out).toContain('total 2')
    const critIdx = out.indexOf('crit one')
    const lowIdx = out.indexOf('low one')
    expect(critIdx).toBeGreaterThan(-1)
    expect(lowIdx).toBeGreaterThan(critIdx)
  })
})
