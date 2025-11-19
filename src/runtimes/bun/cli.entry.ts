/**
 * @fileoverview Bun CLI entrypoint for the `gex-bun` binary.
 *
 * This thin wrapper invokes the shared Bun runtime `run` function when the
 * generated bundle is executed as the main module.
 *
 * Bun treats any use of CommonJS globals like `module` as a signal that the
 * file is CommonJS, which then forbids `import` statements that rely on ESM
 * semantics. To keep this bundle ESM-only (and avoid Bun's
 * "Cannot use import statement with CommonJS-only features" error), we detect
 * "main" status using ESM-friendly checks only.
 */

import { run } from './cli.js'

const isMainModule = (() => {
  try {
    // Bun exposes `import.meta.main` for main-module detection.
    if (typeof import.meta !== 'undefined' && 'main' in import.meta) {
      return (import.meta as any).main === true
    }

    // Fallback: compare the current module URL to the executed script path.
    if (typeof import.meta !== 'undefined' && typeof process !== 'undefined') {
      return import.meta.url === `file://${process.argv[1]}`
    }

    return false
  } catch {
    return false
  }
})()

if (isMainModule) {
  run().catch((error) => {
    console.error('Bun CLI error:', error)
    process.exitCode = 1
  })
}
