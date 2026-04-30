import { describe, expect, it, vi } from 'vitest'

import type { AuditResult } from '../npm-cli.js'

import {
  formatAuditTable,
  formatAuditSummary,
  handleAuditWorkflow,
  highestSeverity,
  meetsFailThreshold,
  severityRank,
} from './audit.js'

describe('audit utilities', () => {
  it('ranks severities low → critical', () => {
    expect(severityRank('info')).toBe(0)
    expect(severityRank('low')).toBe(1)
    expect(severityRank('moderate')).toBe(2)
    expect(severityRank('high')).toBe(3)
    expect(severityRank('critical')).toBe(4)
  })

  it('returns highest severity present in summary', () => {
    expect(
      highestSeverity({ info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }),
    ).toBeNull()
    expect(highestSeverity({ info: 1, low: 0, moderate: 2, high: 0, critical: 0, total: 3 })).toBe(
      'moderate',
    )
    expect(highestSeverity({ info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 })).toBe(
      'critical',
    )
  })

  it('meetsFailThreshold compares highest severity against threshold', () => {
    const clean = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
    const moderate = { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 }
    const critical = { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 }

    expect(meetsFailThreshold(clean, 'low')).toBe(false)
    expect(meetsFailThreshold(moderate, 'high')).toBe(false)
    expect(meetsFailThreshold(moderate, 'moderate')).toBe(true)
    expect(meetsFailThreshold(critical, 'low')).toBe(true)
  })

  it('formats summary as a one-line string', () => {
    expect(
      formatAuditSummary({ info: 0, low: 1, moderate: 0, high: 2, critical: 1, total: 4 }),
    ).toBe('4 vulnerabilities (1 critical, 2 high, 1 low)')
  })

  it('handleAuditWorkflow returns nothing when disabled', async () => {
    const runAudit = vi.fn()
    const result = await handleAuditWorkflow({ enabled: false, runAudit })
    expect(result.audit).toBeUndefined()
    expect(result.shouldFail).toBe(false)
    expect(runAudit).not.toHaveBeenCalled()
  })

  it('handleAuditWorkflow runs audit and reports no failure under threshold', async () => {
    const audit: AuditResult = {
      summary: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
      vulnerabilities: [
        { name: 'pkg', severity: 'moderate', range: '<1.0.0', fix_available: false },
      ],
    }
    const runAudit = vi.fn().mockResolvedValue(audit)
    const result = await handleAuditWorkflow({ enabled: true, failOn: 'high', runAudit })
    expect(result.audit).toBe(audit)
    expect(result.shouldFail).toBe(false)
    expect(runAudit).toHaveBeenCalledOnce()
  })

  it('handleAuditWorkflow reports failure when threshold met', async () => {
    const audit: AuditResult = {
      summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 },
      vulnerabilities: [
        { name: 'pkg', severity: 'critical', range: '<1.0.0', fix_available: true },
      ],
    }
    const runAudit = vi.fn().mockResolvedValue(audit)
    const result = await handleAuditWorkflow({ enabled: true, failOn: 'high', runAudit })
    expect(result.shouldFail).toBe(true)
  })

  it('handleAuditWorkflow without failOn never marks failure', async () => {
    const audit: AuditResult = {
      summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 },
      vulnerabilities: [
        { name: 'pkg', severity: 'critical', range: '<1.0.0', fix_available: false },
      ],
    }
    const runAudit = vi.fn().mockResolvedValue(audit)
    const result = await handleAuditWorkflow({ enabled: true, runAudit })
    expect(result.shouldFail).toBe(false)
  })

  it('formats table with headers and rows', () => {
    const result: AuditResult = {
      summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 },
      vulnerabilities: [
        {
          name: 'minimist',
          severity: 'critical',
          range: '<0.2.1',
          fix_available: true,
          title: 'Prototype Pollution',
          url: 'https://example.com',
        },
      ],
    }
    const table = formatAuditTable(result.vulnerabilities)
    expect(table).toContain('Package')
    expect(table).toContain('Severity')
    expect(table).toContain('minimist')
    expect(table).toContain('critical')
  })
})
