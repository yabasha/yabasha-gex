import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildReportFromNpmTree } from './transform.js'

vi.mock('node:fs/promises')
const mockReadFile = vi.mocked(readFile)

describe('transform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildReportFromNpmTree', () => {
    const mockPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        commander: '^12.1.0',
      },
      devDependencies: {
        vitest: '^2.1.1',
        typescript: '^5.6.2',
      },
    }

    const mockNpmTree = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        commander: {
          version: '12.1.0',
          path: '/path/to/project/node_modules/commander',
        },
        vitest: {
          version: '2.1.1',
          path: '/path/to/project/node_modules/vitest',
        },
        typescript: {
          version: '5.6.2',
          path: '/path/to/project/node_modules/typescript',
        },
      },
    }

    it('should build local report with project metadata', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson))

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
        cwd: '/test/path',
      })

      expect(result.report_version).toBe('1.0')
      expect(result.tool_version).toBe('0.3.2')
      expect(result.project_name).toBe('test-project')
      expect(result.project_version).toBe('1.0.0')
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should categorize dependencies correctly', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson))

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
        cwd: '/test/path',
      })

      expect(result.local_dependencies).toEqual([
        {
          name: 'commander',
          version: '12.1.0',
          resolved_path: '/path/to/project/node_modules/commander',
        },
      ])

      expect(result.local_dev_dependencies).toEqual([
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
      ])

      expect(result.global_packages).toEqual([])
    })

    it('should handle missing package.json gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'))

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
        cwd: '/test/path',
      })

      expect(result.project_name).toBeUndefined()
      expect(result.project_version).toBeUndefined()
      expect(result.local_dependencies.length).toBeGreaterThan(0)
    })

    it('should handle malformed package.json', async () => {
      mockReadFile.mockResolvedValue('{ invalid json }')

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
      })

      expect(result.project_name).toBeUndefined()
      expect(result.project_version).toBeUndefined()
    })

    it('should generate fallback paths when node.path is missing', async () => {
      const treeWithoutPaths = {
        dependencies: {
          commander: {
            version: '12.1.0',
          },
        },
      }

      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'test', devDependencies: {} }))

      const result = await buildReportFromNpmTree(treeWithoutPaths, {
        context: 'local',
        toolVersion: '0.3.2',
        cwd: '/test/path',
      })

      expect(result.local_dependencies[0].resolved_path).toBe(
        path.join('/test/path', 'node_modules', 'commander'),
      )
    })

    it('should handle global context', async () => {
      const globalTree = {
        dependencies: {
          '@yabasha/gex': {
            version: '0.3.2',
            path: '/usr/local/lib/node_modules/@yabasha/gex',
          },
          npm: {
            version: '10.2.4',
            path: '/usr/local/lib/node_modules/npm',
          },
        },
      }

      const result = await buildReportFromNpmTree(globalTree, {
        context: 'global',
        toolVersion: '0.3.2',
        globalRoot: '/usr/local/lib/node_modules',
      })

      expect(result.project_name).toBeUndefined()
      expect(result.project_version).toBeUndefined()
      expect(result.local_dependencies).toEqual([])
      expect(result.local_dev_dependencies).toEqual([])

      expect(result.global_packages).toEqual([
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
      ])
    })

    it('should sort packages alphabetically', async () => {
      const unsortedTree = {
        dependencies: {
          zebra: { version: '1.0.0', path: '/path/zebra' },
          alpha: { version: '1.0.0', path: '/path/alpha' },
          beta: { version: '1.0.0', path: '/path/beta' },
        },
      }

      mockReadFile.mockResolvedValue(JSON.stringify({ devDependencies: {} }))

      const result = await buildReportFromNpmTree(unsortedTree, {
        context: 'local',
        toolVersion: '0.3.2',
      })

      const names = result.local_dependencies.map((p) => p.name)
      expect(names).toEqual(['alpha', 'beta', 'zebra'])
    })

    it('should include tree when includeTree is true', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson))

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
        includeTree: true,
      })

      expect(result.tree).toEqual(mockNpmTree)
    })

    it('should not include tree when includeTree is false', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockPackageJson))

      const result = await buildReportFromNpmTree(mockNpmTree, {
        context: 'local',
        toolVersion: '0.3.2',
        includeTree: false,
      })

      expect(result.tree).toBeUndefined()
    })

    it('should handle empty dependencies', async () => {
      const emptyTree = { dependencies: {} }
      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'empty-project', version: '1.0.0' }))

      const result = await buildReportFromNpmTree(emptyTree, {
        context: 'local',
        toolVersion: '0.3.2',
      })

      expect(result.local_dependencies).toEqual([])
      expect(result.local_dev_dependencies).toEqual([])
      expect(result.global_packages).toEqual([])
    })

    it('should handle null/undefined dependencies', async () => {
      const nullTree = { dependencies: null }
      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'null-project' }))

      const result = await buildReportFromNpmTree(nullTree, {
        context: 'local',
        toolVersion: '0.3.2',
      })

      expect(result.local_dependencies).toEqual([])
      expect(result.local_dev_dependencies).toEqual([])
    })

    it('should handle packages with missing versions', async () => {
      const treeWithMissingVersions = {
        dependencies: {
          'broken-package': {
            path: '/path/to/broken-package',
          },
        },
      }

      mockReadFile.mockResolvedValue(JSON.stringify({ devDependencies: {} }))

      const result = await buildReportFromNpmTree(treeWithMissingVersions, {
        context: 'local',
        toolVersion: '0.3.2',
      })

      expect(result.local_dependencies[0]).toEqual({
        name: 'broken-package',
        version: '',
        resolved_path: '/path/to/broken-package',
      })
    })

    it('should honor devDependencies section in tree data', async () => {
      const treeWithDevSections = {
        dependencies: {
          prod: { version: '1.0.0', path: '/deps/prod' },
        },
        devDependencies: {
          dev: { version: '2.0.0', path: '/deps/dev' },
        },
      }

      mockReadFile.mockRejectedValue(new Error('missing package.json'))

      const result = await buildReportFromNpmTree(treeWithDevSections, {
        context: 'local',
        toolVersion: '0.3.2',
        cwd: '/test/path',
      })

      expect(result.local_dependencies).toEqual([
        { name: 'prod', version: '1.0.0', resolved_path: '/deps/prod' },
      ])
      expect(result.local_dev_dependencies).toEqual([
        { name: 'dev', version: '2.0.0', resolved_path: '/deps/dev' },
      ])
    })
  })
})
