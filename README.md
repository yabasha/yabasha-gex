# @yabasha/gex

Modern **TypeScript npm package + CLI** starter — batteries included:

- ⚙️ Build: **tsup** (ESM + CJS) with type declarations
- 🧰 CLI: **commander**
- ✅ Tests: **vitest**
- 🧹 Code quality: **ESLint (flat)** + **Prettier**
- 🧾 Releases: **Changesets**
- 🤖 CI: GitHub Actions (lint, test, build, release)

## Quickstart

```bash
# 1) Use this template
git clone <this-repo-or-zip> yourpkg && cd yourpkg

# 2) Install deps
npm i

# 3) Run tests
npm test

# 4) Build (dist/ with .mjs + .cjs + d.ts)
npm run build

# 5) Try the CLI
node dist/cli.cjs --help
```

Or run in dev-watch mode:

```bash
npm run dev
```

## CLI usage

The published binary name is `gex` (package name remains `@yabasha/gex`). The root command defaults to `local`.

Examples:

```bash
# Default (local), JSON to stdout or default file when -f is provided
gex                  # same as: gex local
gex -f md -o report.md

# Local: exclude devDependencies
gex local --omit-dev -f json -o deps.json

# Global packages
gex global -f md -o global.md

# Run locally without install (after build)
node dist/cli.cjs --help
node dist/cli.cjs -f json
```

Banner used in `--help`:

```
  ________                __
 /  _____/  ____   _____/  |_  ____   ____
/   \  ___ /  _ \ /  _ \   __\/ __ \ /    \
\    \_\  (  <_> |  <_> )  | \  ___/|   |  \
 \______  /\____/ \____/|__|  \___  >___|  /
        \/                         \/     \/
                      GEX
```

## Rename package

- Update `name` in `package.json`.
- Update CLI name in `package.json > bin` and `src/cli.ts` (`.name('yourpkg')`).

## Publish to npm

```bash
# Create a changeset (bump + changelog)
npx changeset

# Version and publish
npm run release
```

> Tip: set `NPM_TOKEN` in your GitHub repo secrets to enable the release workflow.

## GitHub Actions

- **ci.yml**: runs on PRs and pushes (lint, test, build).
- **release.yml**: publishes packages on pushes to `main` when Changesets are present.

## Project structure

```
├── src/
│   ├── index.ts       # Library entry (exports)
│   ├── cli.ts         # CLI entry (Commander-based)
│   └── index.test.ts  # Vitest example
├── tsup.config.ts     # Dual builds + shebang for CLI
├── vitest.config.ts
├── eslint.config.js
├── tsconfig.json
├── .changeset/        # Changesets config
└── .github/workflows/ # CI + Release
```

Happy hacking! ✨
