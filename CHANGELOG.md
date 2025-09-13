# @yabasha/gex

## 0.3.3

### Patch Changes

- [#10](https://github.com/yabasha/yabasha-gex/pull/10) [`b8a1183`](https://github.com/yabasha/yabasha-gex/commit/b8a1183afefa81374ed8163728b170e8c1c0935b) Thanks [@yabasha](https://github.com/yabasha)! - chore(release): test CI/CD flow by adding a no-op changeset.
  - Ensures the Release workflow opens a "Version Packages" PR
  - After merging that PR, publish should run with a build step

## 0.3.2

### Patch Changes

- [#7](https://github.com/yabasha/yabasha-gex/pull/7) [`a37b448`](https://github.com/yabasha/yabasha-gex/commit/a37b4484b135cf8a809fde762d0174cfed8e94d5) Thanks [@yabasha](https://github.com/yabasha)! - Docs: add Contribute section to README with setup, tests, changesets, and PR flow. Also document `gex read` JSON+Markdown support and positional path.

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
