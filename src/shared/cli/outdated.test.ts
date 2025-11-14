import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formatOutdatedTable,
  handleOutdatedWorkflow,
  normalizeUpdateSelection,
  resolveOutdatedWithNpmView,
} from './outdated.js'
import { npmViewVersion } from '../npm-cli.js'

vi.mock('../npm-cli.js', () => ({
  npmViewVersion: vi.fn(),
}))

const mockNpmViewVersion = vi.mocked(npmViewVersion)

describe('outdated utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes update selection', () => {
    expect(normalizeUpdateSelection(undefined)).toEqual({
      shouldUpdate: false,
      updateAll: false,
      packages: [],
    })

    expect(normalizeUpdateSelection(true)).toEqual({
      shouldUpdate: true,
      updateAll: true,
      packages: [],
    })

    expect(normalizeUpdateSelection(['pkg1', 'pkg2'])).toEqual({
      shouldUpdate: true,
      updateAll: false,
      packages: ['pkg1', 'pkg2'],
    })
  })

  it('renders table headers and rows', () => {
    const table = formatOutdatedTable([
      { name: 'a', current: '1.0.0', wanted: '1.1.0', latest: '2.0.0', type: 'prod' },
    ])
    expect(table).toContain('Name')
    expect(table).toContain('1.0.0')
  })

  it('handles workflow with check only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const proceed = await handleOutdatedWorkflow({
      checkOutdated: true,
      selection: { shouldUpdate: false, updateAll: false, packages: [] },
      contextLabel: 'local',
      outFile: undefined,
      fetchOutdated: async () => [
        { name: 'pkg', current: '1.0.0', wanted: '1.1.0', latest: '2.0.0', type: 'prod' },
      ],
    })

    expect(logSpy).toHaveBeenCalled()
    expect(proceed).toBe(false)
  })

  it('resolves outdated packages via npm view', async () => {
    mockNpmViewVersion.mockResolvedValueOnce('2.0.0')

    const result = await resolveOutdatedWithNpmView([
      { name: 'pkg', current: '1.0.0', declared: '^1.0.0', type: 'prod' },
    ])
    expect(result).toEqual([
      { name: 'pkg', current: '1.0.0', wanted: '^1.0.0', latest: '2.0.0', type: 'prod' },
    ])
  })
})
