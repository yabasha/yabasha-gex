# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview and prerequisites

- TypeScript library + CLI package. Node >= 18.18. Package manager: npm.
- Workspace rule: for any GitHub-related operations (PRs, issues, CI workflows), use the gh CLI.

## Common commands

- Install deps: npm i (CI uses npm ci)
- Build (tsup → dist/ with ESM+CJS+d.ts): npm run build
- Dev watch (rebuild + show CLI help on success): npm run dev
- Lint (ESLint flat config): npm run lint
- Format (Prettier): npm run format
- Tests (Vitest)
  - All tests: npm test
  - Watch mode: npm run test:watch
  - Single file: npm test -- src/index.test.ts
  - Filter by name: npm test -- -t "greet"
  - Coverage: npm test -- --coverage
- Run CLI after build: node dist/cli.cjs --name Yabasha
- Pack tarball (inspect publish contents): npm run version-pack

## High-level architecture and structure

- Build system: tsup builds two entry points (see tsup.config.ts)
  - Library: src/index.ts → dist/index.(mjs|cjs) with .d.ts and sourcemaps; Node 18 target.
  - CLI: src/cli.ts → dist/cli.(mjs|cjs) with shebang banner; no .d.ts for CLI.
- Package config (package.json)
  - type: "module" with dual outputs; exports map types/import/require to dist outputs.
  - bin points to dist/cli.cjs (CLI entry). The published CLI command name comes from the bin key.
  - Scripts: build (tsup), dev (watch), lint, format, test/test:watch (vitest), release (changeset publish).
- CLI: Commander-based (src/cli.ts), delegates to library functions (e.g., greet()).
- Library API: src/index.ts exports functions for consumers.
- Tests: Vitest with globals; test files matched by src/\*_/_.test.ts (vitest.config.ts).
- Linting/formatting: ESLint (flat) + Prettier; dist and node_modules are ignored.
- CI/CD: GitHub Actions
  - .github/workflows/ci.yml runs on push/PR: Node 20 → npm ci → lint → test → build.
  - .github/workflows/release.yml runs on push to main: changeset version → build → npm publish (public).
- Versioning/releases: Changesets (.changeset/) drives version bumps + changelogs.

## Release and publishing flow

- Create a changeset locally: npx changeset (choose bump, write summary) → commit.
- Push to a branch and open a PR (use gh). On merge to main, release workflow versions and publishes.
- Manual publish (optional): npm run release (changeset publish) with valid npm auth.
- Secrets: set NPM_TOKEN in GitHub repo secrets for release.yml to publish.
- Housekeeping: update .changeset/config.json repo to the real org/repo; if you rename the package/CLI, update package.json name/bin and src/cli.ts program name (also noted in README.md).
