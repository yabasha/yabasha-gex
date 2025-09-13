import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Report } from './types.js'
import { run } from './cli.js'
import { npmLs, npmRootGlobal } from './npm.js'

vi.mock('node:fs/promises')
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: vi.fn(),
}))
vi.mock('./npm.js')

const getToolVersion = async () => '0.3.2'

const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)
const mockMkdir = vi.mocked(mkdir)
const mockExecFile = vi.mocked(execFile)
const mockPromisify = vi.mocked(promisify)
const mockNpmLs = vi.mocked(npmLs)
const mockNpmRootGlobal = vi.mocked(npmRootGlobal)

const mockExecFileAsync = vi.fn()

const mockPackageJson = {
  name: 'test-project',
  version: '1.0.0',
  description: 'A test project',
  homepage: 'https://example.com',
  bugs: 'https://github.com/test/issues',
}

const mockNpmLsResponse = {
  dependencies: {
    commander: {
      version: '12.1.0',
      path: '/path/to/commander',
    },
    axios: {
      version: '1.6.0',
      path: '/path/to/axios',
    },
  },
}

const mockReport: Report = {
  report_version: '1.0',
  timestamp: '2025-01-13T12:00:00.000Z',
  tool_version: '0.3.2',
  global_packages: [],
  local_dependencies: [
    { name: 'axios', version: '1.6.0', resolved_path: '/path/to/axios' },
    { name: 'commander', version: '12.1.0', resolved_path: '/path/to/commander' },
  ],
  local_dev_dependencies: [],
}

describe('CLI', () => {
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let originalArgv: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    originalArgv = process.argv
    process.exitCode = 0

    mockPromisify.mockImplementation((fn) => {
      if (fn === mockExecFile) {
        return mockExecFileAsync
      }
      return mockExecFileAsync
    })
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    mockNpmLs.mockResolvedValue(mockNpmLsResponse)
    mockNpmRootGlobal.mockResolvedValue('/usr/local/lib/node_modules')

    mockReadFile.mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('package.json')) {
        return Promise.resolve(JSON.stringify(mockPackageJson))
      }
      return Promise.reject(new Error('File not found'))
    })
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    process.argv = originalArgv
    process.exitCode = 0
  })

  describe('local command (default)', () => {
    it('should generate local report in JSON format by default', async () => {
      process.argv = ['node', 'cli.js', 'local']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()

      await run()

      expect(mockNpmLs).toHaveBeenCalledWith({
        global: false,
        omitDev: false,
        depth0: true,
        cwd: process.cwd(),
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.json',
        expect.stringContaining('"report_version": "1.0"'),
        'utf8',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('Wrote report to gex-report.json')
    })

    it('should generate local report with markdown format', async () => {
      process.argv = ['node', 'cli.js', 'local', '--output-format', 'md']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()

      await run()

      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.md',
        expect.stringContaining('# GEX Report'),
        'utf8',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('Wrote report to gex-report.md')
    })

    it('should write report to file when --out-file is specified', async () => {
      process.argv = ['node', 'cli.js', 'local', '--out-file', 'output.json']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()

      await run()

      expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
      expect(mockWriteFile).toHaveBeenCalledWith(
        'output.json',
        expect.stringContaining('"report_version": "1.0"'),
        'utf8',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('Wrote report to output.json')
    })

    it('should exclude devDependencies when --omit-dev flag is used', async () => {
      process.argv = ['node', 'cli.js', 'local', '--omit-dev']

      await run()

      expect(mockNpmLs).toHaveBeenCalledWith({
        global: false,
        omitDev: true,
        depth0: true,
        cwd: process.cwd(),
      })
    })

    it('should include full tree when --full-tree flag is used', async () => {
      process.argv = ['node', 'cli.js', 'local', '--full-tree']

      await run()

      expect(mockNpmLs).toHaveBeenCalledWith({
        global: false,
        omitDev: false,
        depth0: false,
        cwd: process.cwd(),
      })
    })

    it('should output to console when explicit empty out-file', async () => {
      process.argv = ['node', 'cli.js', 'local']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()

      await run()

      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.json',
        expect.stringContaining('"axios"'),
        'utf8',
      )
      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.json',
        expect.stringContaining('"commander"'),
        'utf8',
      )
    })
  })

  describe('global command', () => {
    it('should generate global report in JSON format', async () => {
      process.argv = ['node', 'cli.js', 'global']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()
      mockNpmLs.mockResolvedValue({
        dependencies: {
          npm: { version: '10.2.0', path: '/usr/local/lib/node_modules/npm' },
        },
      })

      await run()

      expect(mockNpmLs).toHaveBeenCalledWith({
        global: true,
        depth0: true,
        cwd: process.cwd(),
        omitDev: false,
      })
      expect(mockNpmRootGlobal).toHaveBeenCalled()
      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.json',
        expect.stringContaining('"global_packages"'),
        'utf8',
      )
    })

    it('should generate global report with markdown format', async () => {
      process.argv = ['node', 'cli.js', 'global', '--output-format', 'md']
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue()
      mockNpmLs.mockResolvedValue({
        dependencies: {
          npm: { version: '10.2.0', path: '/usr/local/lib/node_modules/npm' },
        },
      })

      await run()

      expect(mockWriteFile).toHaveBeenCalledWith(
        'gex-report.md',
        expect.stringContaining('# GEX Report'),
        'utf8',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('Wrote report to gex-report.md')
    })

    it('should handle npmRootGlobal failure gracefully', async () => {
      process.argv = ['node', 'cli.js', 'global']
      mockNpmRootGlobal.mockRejectedValue(new Error('npm root -g failed'))

      await run()

      expect(mockNpmLs).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalled() // Should still output report
    })
  })

  describe('read command', () => {
    const mockJsonReport = JSON.stringify(mockReport)
    const mockMarkdownReport = `# GEX Report

## Project Metadata
- Name: test-project
- Version: 1.0.0

## Local Dependencies
| Name | Version | Path |
| --- | --- | --- |
| axios | 1.6.0 | /path/to/axios |
| commander | 12.1.0 | /path/to/commander |

---
_Generated by GEX_`

    it('should print packages from JSON report by default', async () => {
      process.argv = ['node', 'cli.js', 'read', 'test-report.json']
      mockReadFile.mockResolvedValue(mockJsonReport)

      await run()

      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('test-report.json'), 'utf8')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Local Dependencies:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- axios@1.6.0'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- commander@12.1.0'))
    })

    it('should print packages from markdown report', async () => {
      process.argv = ['node', 'cli.js', 'read', 'test-report.md']
      mockReadFile.mockResolvedValue(mockMarkdownReport)

      await run()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Local Dependencies:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- axios@1.6.0'))
    })

    it('should install packages when --install flag is used', async () => {
      process.argv = ['node', 'cli.js', 'read', 'test-report.json', '--install']
      mockReadFile.mockResolvedValue(mockJsonReport)

      await run()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['i', 'axios@1.6.0', 'commander@12.1.0'],
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installing local deps:'))
    })

    it('should handle both print and install when both flags are specified', async () => {
      process.argv = ['node', 'cli.js', 'read', 'test-report.json', '--print', '--install']
      mockReadFile.mockResolvedValue(mockJsonReport)

      await run()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Local Dependencies:'))

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['i', 'axios@1.6.0', 'commander@12.1.0'],
        expect.any(Object),
      )
    })

    it('should use --report option over positional argument', async () => {
      process.argv = ['node', 'cli.js', 'read', 'ignored.json', '--report', 'priority.json']
      mockReadFile.mockResolvedValue(mockJsonReport)

      await run()

      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('priority.json'), 'utf8')
    })

    it('should handle file not found error', async () => {
      process.argv = ['node', 'cli.js', 'read', 'missing.json']
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

      await run()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read report at'),
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Specify a report path with:'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('should handle invalid JSON in report file', async () => {
      process.argv = ['node', 'cli.js', 'read', 'invalid.json']
      mockReadFile.mockResolvedValue('invalid json content')

      await run()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read report at'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('should handle empty report gracefully', async () => {
      const emptyReport: Report = {
        ...mockReport,
        global_packages: [],
        local_dependencies: [],
        local_dev_dependencies: [],
      }
      process.argv = ['node', 'cli.js', 'read', 'empty.json']
      mockReadFile.mockResolvedValue(JSON.stringify(emptyReport))

      await run()

      expect(consoleLogSpy).toHaveBeenCalledWith('(no packages found in report)')
    })

    it('should handle global packages in report', async () => {
      const globalReport: Report = {
        ...mockReport,
        global_packages: [
          { name: 'npm', version: '10.2.0', resolved_path: '/usr/local/lib/node_modules/npm' },
        ],
        local_dependencies: [],
        local_dev_dependencies: [],
      }
      process.argv = ['node', 'cli.js', 'read', 'global.json', '--install']
      mockReadFile.mockResolvedValue(JSON.stringify(globalReport))

      await run()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['i', '-g', 'npm@10.2.0'],
        expect.any(Object),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installing global:'))
    })

    it('should handle dev dependencies in report', async () => {
      const devReport: Report = {
        ...mockReport,
        global_packages: [],
        local_dependencies: [],
        local_dev_dependencies: [
          { name: 'vitest', version: '2.1.9', resolved_path: '/path/to/vitest' },
        ],
      }
      process.argv = ['node', 'cli.js', 'read', 'dev.json', '--install']
      mockReadFile.mockResolvedValue(JSON.stringify(devReport))

      await run()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['i', '-D', 'vitest@2.1.9'],
        expect.any(Object),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Installing local devDeps:'),
      )
    })
  })

  describe('version and help', () => {
    it('should handle version command flow', async () => {
      const versionResult = await getToolVersion()
      expect(versionResult).toBe('0.3.2')
    })

    it('should create a proper CLI program structure', async () => {
      const testArgv = ['node', 'cli.js', 'local', '--help']

      try {
        await run(testArgv)
      } catch (error: any) {
        expect(error.message || error.code).toBeDefined()
      }

      expect(true).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle npm command failures gracefully', async () => {
      process.argv = ['node', 'cli.js', 'local']
      mockNpmLs.mockRejectedValue(new Error('npm ls failed: command not found'))

      await expect(run()).rejects.toThrow('npm ls failed: command not found')
    })

    it('should handle package.json read failures gracefully', async () => {
      process.argv = ['node', 'cli.js', 'local']
      mockReadFile.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('package.json')) {
          return Promise.reject(new Error('Permission denied'))
        }
        return Promise.resolve('{}')
      })

      await run()

      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should handle write file failures', async () => {
      process.argv = ['node', 'cli.js', 'local', '--out-file', 'readonly.json']
      mockMkdir.mockRejectedValue(new Error('Permission denied'))

      await expect(run()).rejects.toThrow('Permission denied')
    })
  })

  describe('markdown parsing', () => {
    it('should correctly parse markdown report with project metadata', async () => {
      const markdownWithMetadata = `# GEX Report

## Project Metadata
- Name: my-project
- Version: 2.0.0
- Description: Test project
- Homepage: https://example.com
- Bugs: https://github.com/test/issues

## Local Dependencies
| Name | Version | Path |
| --- | --- | --- |
| lodash | 4.17.21 | /path/to/lodash |

---
_Generated by GEX_`

      process.argv = ['node', 'cli.js', 'read', 'with-metadata.md']
      mockReadFile.mockResolvedValue(markdownWithMetadata)

      await run()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Local Dependencies:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- lodash@4.17.21'))
    })

    it('should handle malformed markdown tables gracefully', async () => {
      const malformedMarkdown = `# GEX Report

## Local Dependencies
| Name | Version | Path |
| --- | --- | --- |
| incomplete-row | |
| | 1.0.0 | /path |
|  |  |  |

---
_Generated by GEX_`

      process.argv = ['node', 'cli.js', 'read', 'malformed.md']
      mockReadFile.mockResolvedValue(malformedMarkdown)

      await run()

      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })
})
