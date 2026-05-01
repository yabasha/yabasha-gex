/**
 * @fileoverview Yarn CLI entrypoint for the `gex-yarn` binary.
 *
 * Thin wrapper that invokes the shared Yarn runtime `run` function when the
 * generated bundle is executed as the main module.
 */

import { run } from './cli.js'

const isMainModule = (() => {
  try {
    if (typeof require !== 'undefined' && typeof module !== 'undefined') {
      return (require as any).main === module
    }
    if (typeof import.meta !== 'undefined') {
      return import.meta.url === `file://${process.argv[1]}`
    }
    return false
  } catch {
    return false
  }
})()

if (isMainModule) {
  run().catch((error) => {
    console.error('Yarn CLI error:', error)
    process.exitCode = 1
  })
}
