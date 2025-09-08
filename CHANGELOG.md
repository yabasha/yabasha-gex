# @yabasha/gex

## 0.3.0

### Minor Changes

- [#5](https://github.com/yabasha/yabasha-gex/pull/5) [`312c822`](https://github.com/yabasha/yabasha-gex/commit/312c822c3d08d53686ceca2a92d62d5e0d800d99) Thanks [@yabasha](https://github.com/yabasha)! - Add `gex read` subcommand to consume previous JSON reports.
  - Default behavior prints `name@version` for global, dependencies, and devDependencies
  - `-r/--report <path>` to specify report file (defaults to `gex-report.json`)
  - `-i/--install` installs packages using npm:
    - global packages → `npm i -g name@version`
    - local dependencies → `npm i name@version`
    - local devDependencies → `npm i -D name@version`

## 0.2.1

### Patch Changes

- [`12772ca`](https://github.com/yabasha/yabasha-gex/commit/12772ca7325addca0e2744f58adaed810cce3a7e) Thanks [@yabasha](https://github.com/yabasha)! - release first version for `GEX` Cli Tool
