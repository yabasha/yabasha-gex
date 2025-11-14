# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains all runtime code; `cli/` and `cli.ts` wire Commander commands, `report/` formats JSON/Markdown payloads, `runtimes/` bridges Node/Bun entry points, and `shared/` hosts utilities.
- Tests live beside their modules as `*.test.ts` (e.g., `src/npm.test.ts`), keeping fixtures close to the logic they cover.
- `dist/` holds generated CJS/ESM bundles created by `tsup`; delete only via `npm run build`.

## Build, Test, and Development Commands

- `npm run build` — Runs `tsup` to produce publishable artifacts in `dist/`.
- `npm run dev` — Watches `src/`, rebuilds on change, and executes `node dist/cli.cjs --help`.
- `npm test` / `npm run test:watch` — Executes the Vitest suites once or in watch mode.
- `npm run lint` / `npm run format` — Apply ESLint 9 and Prettier 3.3, matching the lint-staged hook.

## Coding Style & Naming Conventions

- Target Node.js 20+ with ES modules; prefer `const` defaults and typed helper functions in shared utilities.
- Follow Prettier defaults: 2-space indent, trailing commas, double quotes for JSON, and newline-terminated files.
- File names should describe their domain (`report/markdown-writer.ts`, `validators.test.ts`) and export named helpers unless a default export makes the CLI entry clearer.

## Testing Guidelines

- Create Vitest specs next to the implementation; rely on snapshots only for CLI help text because dependency ordering must remain deterministic.
- Use `npm.test.ts` and `cli.test.ts` as guides for mocking npm output and Commander invocations; stub shell calls so tests pass without global packages.
- Before pushing, run `npm run lint && npm test` to confirm parsers, report writers, and runtime shims remain stable.

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits (`feat:`, `chore(npm):`, `feat!: breaking`); include scopes when touching shared tooling.
- Every PR should state intent, list CLI or schema changes, link issues, attach CLI output screenshots when output changes, and add a Changeset when user-facing output shifts.
- Confirm build, lint, and tests succeed locally; CI mirrors `npm run build && npm test`, so catching failures early avoids churn.

## Security & Configuration Tips

- Enforce Node `>=20` locally and in CI to match the runtime features compiled by `tsup`.
- Avoid committing real `gex-report.json` snapshots from clients; scrub data and rely on fixtures like `global.md`.
- Maintain argument sanitization in `src/npm.ts` before spawning npm commands to prevent shell injection when paths or flags are user supplied.
