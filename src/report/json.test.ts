import { describe, expect, it } from 'vitest'

import type { Report } from '../types.js'

import { renderJson } from './json.js'

describe('renderJson', () => {
  const mockReport: Report = {
    report_version: '1.0',
    timestamp: '2025-01-13T12:00:00.000Z',
    tool_version: '0.3.2',
    project_name: 'test-project',
    project_version: '1.0.0',
    global_packages: [
      {
        name: '@yabasha/gex',
        version: '0.3.2',
        resolved_path: '/usr/local/lib/node_modules/@yabasha/gex',
      },
      {
        name: 'npm',
        version: '10.2.4',
        resolved_path: '/usr/local/lib/node_modules/npm',
      },
    ],
    local_dependencies: [
      {
        name: 'axios',
        version: '1.6.0',
        resolved_path: '/path/to/project/node_modules/axios',
      },
      {
        name: 'commander',
        version: '12.1.0',
        resolved_path: '/path/to/project/node_modules/commander',
      },
    ],
    local_dev_dependencies: [
      {
        name: 'typescript',
        version: '5.6.2',
        resolved_path: '/path/to/project/node_modules/typescript',
      },
      {
        name: 'vitest',
        version: '2.1.1',
        resolved_path: '/path/to/project/node_modules/vitest',
      },
    ],
  }

  it('should render valid JSON', () => {
    const result = renderJson(mockReport)

    expect(() => JSON.parse(result)).not.toThrow()

    expect(result).toContain('  "report_version": "1.0"')
  })

  it('should preserve all report data', () => {
    const result = renderJson(mockReport)
    const parsed = JSON.parse(result) as Report

    expect(parsed.report_version).toBe(mockReport.report_version)
    expect(parsed.timestamp).toBe(mockReport.timestamp)
    expect(parsed.tool_version).toBe(mockReport.tool_version)
    expect(parsed.project_name).toBe(mockReport.project_name)
    expect(parsed.project_version).toBe(mockReport.project_version)
    expect(parsed.global_packages).toEqual(mockReport.global_packages)
    expect(parsed.local_dependencies).toEqual(mockReport.local_dependencies)
    expect(parsed.local_dev_dependencies).toEqual(mockReport.local_dev_dependencies)
  })

  it('should sort packages alphabetically', () => {
    const result = renderJson(mockReport)
    const parsed = JSON.parse(result) as Report

    expect(parsed.global_packages[0].name).toBe('@yabasha/gex')
    expect(parsed.global_packages[1].name).toBe('npm')

    expect(parsed.local_dependencies[0].name).toBe('axios')
    expect(parsed.local_dependencies[1].name).toBe('commander')

    expect(parsed.local_dev_dependencies[0].name).toBe('typescript')
    expect(parsed.local_dev_dependencies[1].name).toBe('vitest')
  })

  it('should handle empty arrays', () => {
    const emptyReport: Report = {
      report_version: '1.0',
      timestamp: '2025-01-13T12:00:00.000Z',
      tool_version: '0.3.2',
      global_packages: [],
      local_dependencies: [],
      local_dev_dependencies: [],
    }

    const result = renderJson(emptyReport)
    const parsed = JSON.parse(result) as Report

    expect(parsed.global_packages).toEqual([])
    expect(parsed.local_dependencies).toEqual([])
    expect(parsed.local_dev_dependencies).toEqual([])
  })

  it('should handle minimal report without project metadata', () => {
    const minimalReport: Report = {
      report_version: '1.0',
      timestamp: '2025-01-13T12:00:00.000Z',
      tool_version: '0.3.2',
      global_packages: [],
      local_dependencies: [],
      local_dev_dependencies: [],
    }

    const result = renderJson(minimalReport)
    const parsed = JSON.parse(result) as Report

    expect(parsed.project_name).toBeUndefined()
    expect(parsed.project_version).toBeUndefined()
    expect(parsed.report_version).toBe('1.0')
  })

  it('should include tree data when present', () => {
    const reportWithTree: Report = {
      ...mockReport,
      tree: {
        name: 'test-project',
        dependencies: {
          commander: { version: '12.1.0' },
        },
      },
    }

    const result = renderJson(reportWithTree)
    const parsed = JSON.parse(result) as Report

    expect(parsed.tree).toEqual(reportWithTree.tree)
  })

  it('should handle packages with empty versions and paths', () => {
    const reportWithEmptyFields: Report = {
      report_version: '1.0',
      timestamp: '2025-01-13T12:00:00.000Z',
      tool_version: '0.3.2',
      global_packages: [],
      local_dependencies: [
        {
          name: 'broken-package',
          version: '',
          resolved_path: '',
        },
      ],
      local_dev_dependencies: [],
    }

    const result = renderJson(reportWithEmptyFields)
    const parsed = JSON.parse(result) as Report

    expect(parsed.local_dependencies[0]).toEqual({
      name: 'broken-package',
      version: '',
      resolved_path: '',
    })
  })

  it('should not mutate the original report', () => {
    const originalReport = JSON.parse(JSON.stringify(mockReport))

    renderJson(mockReport)

    expect(mockReport).toEqual(originalReport)
  })

  it('should maintain consistent ordering across multiple calls', () => {
    const result1 = renderJson(mockReport)
    const result2 = renderJson(mockReport)

    expect(result1).toBe(result2)
  })
})
