# @yabasha/gex

## 1.4.4

### Patch Changes

- Add status badges to README

## 1.4.0

### Minor Changes

- [`6f69229`](https://github.com/yabasha/yabasha-gex/commit/6f69229c340f2d3c54d3ee8741510d3850d4f46a) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - feat: add `gb` and `gn` CLI aliases

## 1.3.4

### Patch Changes

- chore: add npm-style outdated workflow with CLI loader, Bun parity, and README clarifications. Highlights:
  - `-c/--check-outdated` and `-u/--update-outdated` work on both Node and Bun CLIs with progress spinners.
  - Bun runtime inspects its own package tree (local/global) and reinstalls outdated globals via `bun add -g pkg@latest`.
  - README documents the workflow so npmjs users see the latest instructions.
  - Loader helper is shared so CI/terminals get feedback while updating.

## 1.0.1

### Patch Changes

- b94376f: feat: add HTML output format

  Added support for generating dependency reports in HTML format with styled tables and project information.

## 1.0.0

### Major Changes

- [#18](https://github.com/yabasha/yabasha-gex/pull/18) [`9c5ec13`](https://github.com/yabasha/yabasha-gex/commit/9c5ec134b94f962112c73a287c6a593bffc88c54) Thanks [@yabasha](https://github.com/yabasha)! - BREAKING CHANGE: Update all dependencies to latest versions and increase Node.js requirement

  **Breaking Changes:**
  - **Node.js engine requirement updated from >=18.18 to >=20** (required by commander v14)
    - Users on Node.js 18.x must upgrade to Node.js 20+ to use this version
    - Node.js 18.x support dropped due to dependency requirements

  **Dependency Updates:**
  - Updated @types/node from ^22.5.4 to ^24.4.0 (major)
  - Updated eslint-config-prettier from ^9.1.0 to ^10.1.8 (major)
  - Updated lint-staged from ^15.2.10 to ^16.1.6 (major)
  - Updated commander from ^12.1.0 to ^14.0.1 (major)
  - Updated vitest from ^2.1.1 to ^3.2.4 (major)
  - Updated @changesets/cli from ^2.27.8 to ^2.29.7 (minor)

  **Security & Quality:**
  - Resolved 5 moderate security vulnerabilities in development dependencies
  - All tests continue to pass and build succeeds with updated dependencies
  - Pre-commit hooks and linting verified to work correctly

## 0.4.0

### Minor Changes

- [#16](https://github.com/yabasha/yabasha-gex/pull/16) [`a5bf5ee`](https://github.com/yabasha/yabasha-gex/commit/a5bf5ee7c129bc61e97cd023a397c790eaf32f99) Thanks [@yabasha](https://github.com/yabasha)! - Changed default output behavior to print JSON to console instead of writing to file automatically.
  - `gex local` and `gex global` now print JSON output to console by default
  - File output now requires explicit `-o/--out-file` flag
  - Added shell redirection examples to documentation
  - No breaking changes - existing `-o` functionality remains unchanged

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
