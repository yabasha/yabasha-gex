import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    outDir: 'dist',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
  },
  // Node.js CLI build (backward compatible)
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm', 'cjs'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node18',
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node',
    },
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
  },
  // Node.js runtime-specific CLI
  {
    entry: { 'cli-node': 'src/runtimes/node/cli.ts' },
    format: ['esm', 'cjs'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node18',
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node',
    },
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
  },
  // Bun CLI build (ESM only, Bun prefers ESM)
  {
    entry: { 'cli-bun': 'src/runtimes/bun/cli.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node18',
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env bun',
    },
    outExtension() {
      return { js: '.mjs' }
    },
  },
])
