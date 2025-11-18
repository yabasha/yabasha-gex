/**
 * @fileoverview Node.js CLI entrypoint for the `gex-node` binary.
 *
 * This thin wrapper invokes the shared Node runtime `run` function when the
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
    console.error('CLI error:', error)
    process.exitCode = 1
  })
}
