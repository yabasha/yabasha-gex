const frames = ['-', '\\', '|', '/'] as const

export type Loader = {
  stop: (finalMessage?: string) => void
}

export function createLoader(message: string): Loader {
  if (!process.stdout.isTTY) {
    console.log(`${message}...`)
    return {
      stop(finalMessage) {
        if (finalMessage) console.log(finalMessage)
      },
    }
  }

  let index = 0
  const interval = globalThis.setInterval(() => {
    const frame = frames[index % frames.length]
    index += 1
    process.stdout.write(`\r${message} ${frame}`)
  }, 80)

  return {
    stop(finalMessage) {
      globalThis.clearInterval(interval)
      process.stdout.write('\r')
      if (finalMessage) {
        console.log(finalMessage)
      } else {
        process.stdout.write('\x1b[2K')
      }
    },
  }
}
