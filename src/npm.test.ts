import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:child_process before importing module under test
const state: {
  scenario: 'ls-ok' | 'ls-error-stdout' | 'ls-error-no-stdout' | 'root-ok' | 'root-fail'
  lsStdout: string
  rootStdout: string
  errorMessage: string
} = {
  scenario: 'ls-ok',
  lsStdout: JSON.stringify({
    name: 'tmp',
    version: '1.0.0',
    dependencies: { commander: { version: '12.1.0' } },
  }),
  rootStdout: '/usr/local/lib/node_modules\n',
  errorMessage: 'boom',
}

vi.mock('node:child_process', () => {
  return {
    execFile: (...args: any[]) => {
      const cb = args[args.length - 1]
      if (typeof cb !== 'function') throw new Error('Callback expected')
      const cmd = args[0]
      const sub = Array.isArray(args[1]) ? args[1][0] : ''
      if (cmd === 'npm' && sub === 'ls') {
        if (state.scenario === 'ls-ok') {
          cb(null, { stdout: state.lsStdout, stderr: '' })
        } else if (state.scenario === 'ls-error-stdout') {
          const err: any = new Error(state.errorMessage)
          err.stdout = state.lsStdout
          err.stderr = 'npm ls warnings'
          cb(err)
        } else if (state.scenario === 'ls-error-no-stdout') {
          const err: any = new Error(state.errorMessage)
          err.stderr = 'bad'
          cb(err)
        } else {
          cb(null, { stdout: state.lsStdout, stderr: '' })
        }
      } else if (cmd === 'npm' && sub === 'root') {
        if (state.scenario === 'root-ok') {
          cb(null, { stdout: state.rootStdout, stderr: '' })
        } else {
          const err: any = new Error(state.errorMessage)
          err.stderr = 'fail root'
          cb(err)
        }
      } else {
        cb(null, { stdout: '', stderr: '' })
      }
    },
  }
})

let npmMod: typeof import('./npm')
beforeAll(async () => {
  npmMod = await import('./npm')
})

beforeEach(() => {
  state.scenario = 'ls-ok'
})

describe('npmLs', () => {
  it('parses JSON on success', async () => {
    state.scenario = 'ls-ok'
    const tree = await npmMod.npmLs({ depth0: true })
    expect(tree?.dependencies?.commander?.version).toBe('12.1.0')
  })

  it('parses JSON from stdout even when npm exits non-zero', async () => {
    state.scenario = 'ls-error-stdout'
    const tree = await npmMod.npmLs({})
    expect(tree?.name).toBe('tmp')
  })

  it('throws when no stdout is available', async () => {
    state.scenario = 'ls-error-no-stdout'
    await expect(npmMod.npmLs({})).rejects.toThrow(/npm ls failed/)
  })
})

describe('npmRootGlobal', () => {
  it('returns trimmed global root', async () => {
    state.scenario = 'root-ok'
    const root = await npmMod.npmRootGlobal()
    expect(root).toBe('/usr/local/lib/node_modules')
  })

  it('throws with helpful error on failure', async () => {
    state.scenario = 'root-fail'
    await expect(npmMod.npmRootGlobal()).rejects.toThrow(/npm root -g failed/)
  })
})
