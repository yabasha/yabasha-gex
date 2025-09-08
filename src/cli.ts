import { Command } from 'commander'
import { greet } from './index.js'

export async function run(argv = process.argv) {
  const program = new Command()
    .name('yourpkg')
    .description('Your awesome TypeScript CLI')
    .version('0.1.0')
    .option('-n, --name <name>', 'Name to greet', 'World')
    .action((opts) => {
      // Business logic can live in src/ and be imported.
      const msg = greet(opts.name)
      // eslint-disable-next-line no-console
      console.log(msg)
    })

  await program.parseAsync(argv)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
}
