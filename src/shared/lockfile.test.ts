import { describe, expect, it } from 'vitest'

import { parseBunLockfile, parsePackageLockJson } from './lockfile.js'

describe('parsePackageLockJson', () => {
  it('extracts root dependencies and devDependencies (lockfileVersion 3)', () => {
    const raw = JSON.stringify({
      name: 'demo',
      version: '0.0.1',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'demo',
          version: '0.0.1',
          dependencies: { commander: '^14.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        },
        'node_modules/commander': { version: '14.0.1' },
        'node_modules/typescript': { version: '5.6.2', dev: true },
      },
    })

    const tree = parsePackageLockJson(raw, { cwd: '/repo' })

    expect(tree.dependencies).toEqual({
      commander: { version: '14.0.1', path: '/repo/node_modules/commander' },
    })
    expect(tree.devDependencies).toEqual({
      typescript: { version: '5.6.2', path: '/repo/node_modules/typescript' },
    })
  })

  it('uses declared spec when an installed version is missing', () => {
    const raw = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { foo: '^1.0.0' },
        },
      },
    })

    const tree = parsePackageLockJson(raw, { cwd: '/repo' })

    expect(tree.dependencies.foo).toEqual({
      version: '^1.0.0',
      path: '/repo/node_modules/foo',
    })
  })

  it('handles scoped package names', () => {
    const raw = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          devDependencies: { '@types/node': '^24.0.0' },
        },
        'node_modules/@types/node': { version: '24.4.1', dev: true },
      },
    })

    const tree = parsePackageLockJson(raw, { cwd: '/repo' })

    expect(tree.devDependencies?.['@types/node']).toEqual({
      version: '24.4.1',
      path: '/repo/node_modules/@types/node',
    })
  })

  it('falls back to the legacy lockfileVersion 1 dependencies map', () => {
    const raw = JSON.stringify({
      name: 'demo',
      version: '0.0.1',
      lockfileVersion: 1,
      dependencies: {
        commander: { version: '14.0.1' },
        typescript: { version: '5.6.2', dev: true },
      },
    })

    const tree = parsePackageLockJson(raw, { cwd: '/repo' })

    expect(tree.dependencies.commander).toEqual({
      version: '14.0.1',
      path: '/repo/node_modules/commander',
    })
    expect(tree.devDependencies?.typescript).toEqual({
      version: '5.6.2',
      path: '/repo/node_modules/typescript',
    })
  })

  it('throws on malformed JSON', () => {
    expect(() => parsePackageLockJson('not-json', { cwd: '/repo' })).toThrow()
  })
})

describe('parseBunLockfile', () => {
  it('extracts root dependencies and devDependencies', () => {
    const raw = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "demo",
      "dependencies": {
        "commander": "^14.0.0",
      },
      "devDependencies": {
        "typescript": "^5.0.0",
      },
    },
  },
  "packages": {
    "commander": ["commander@14.0.1", "", {}, "sha512-fake"],
    "typescript": ["typescript@5.6.2", "", {}, "sha512-fake"],
  }
}
`

    const tree = parseBunLockfile(raw, { cwd: '/repo' })

    expect(tree.dependencies).toEqual({
      commander: { version: '14.0.1', path: '/repo/node_modules/commander' },
    })
    expect(tree.devDependencies).toEqual({
      typescript: { version: '5.6.2', path: '/repo/node_modules/typescript' },
    })
  })

  it('falls back to the declared spec when the package entry is missing', () => {
    const raw = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "dependencies": {
        "foo": "^1.0.0",
      },
    },
  },
  "packages": {}
}
`

    const tree = parseBunLockfile(raw, { cwd: '/repo' })

    expect(tree.dependencies.foo).toEqual({
      version: '^1.0.0',
      path: '/repo/node_modules/foo',
    })
  })

  it('handles scoped package names with @-prefixed descriptors', () => {
    const raw = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "devDependencies": {
        "@types/node": "^24.0.0",
      },
    },
  },
  "packages": {
    "@types/node": ["@types/node@24.4.1", "", {}, "sha512-fake"],
  }
}
`

    const tree = parseBunLockfile(raw, { cwd: '/repo' })

    expect(tree.devDependencies?.['@types/node']).toEqual({
      version: '24.4.1',
      path: '/repo/node_modules/@types/node',
    })
  })

  it('throws on malformed lockfile content', () => {
    expect(() => parseBunLockfile('not-json-at-all', { cwd: '/repo' })).toThrow()
  })
})
