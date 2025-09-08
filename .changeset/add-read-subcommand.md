---
'@yabasha/gex': minor
---

Add `gex read` subcommand to consume previous JSON reports.

- Default behavior prints `name@version` for global, dependencies, and devDependencies
- `-r/--report <path>` to specify report file (defaults to `gex-report.json`)
- `-i/--install` installs packages using npm:
  - global packages → `npm i -g name@version`
  - local dependencies → `npm i name@version`
  - local devDependencies → `npm i -D name@version`
