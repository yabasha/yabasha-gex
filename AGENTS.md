# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains all runtime code; `cli/` and `cli.ts` wire Commander commands, `report/` formats JSON/Markdown payloads, `runtimes/` bridges Node/Bun entry points, and `shared/` hosts utilities.
- `src/runtimes/node` drives the canonical `gex` CLI while `src/runtimes/bun` powers `gex-bun`; both reuse the helpers in `src/shared/cli/*` so feature parity (flags, output, installation) lives in one place.
- `src/shared/cli/install.ts` now abstracts package installation for npm and Bun (`packageManager: 'npm' | 'bun'`), so any CLI entry that supports `--install` must pass the desired manager to keep behaviors in sync.
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

## CLI Behavior & Report Format

- Ship the same user experience for both runtimes: `gex` (Node) and `gex-bun` (Bun) expose `local`, `global`, and `read` commands with identical options. `read` accepts JSON or Markdown, `-i/--install` installs via `npm i` or `bun add` (global installs use `-g`, dev installs use `-D`/`-d`). Example: `gex read -i globalPackages.json` installs globally with npm, while `gex-bun read -i globalPackages.json` shells out to `bun add -g ...`.
- JSON reports must follow the stable shape below so downstream tooling (and Bun parity) stays deterministic:

```
{
  "report_version": "1.0",
  "timestamp": "<ISO8601>",
  "tool_version": "<semver>",
  "project_name"?: "...",
  "project_version"?: "...",
  "global_packages": [{ "name": "pkg", "version": "1.2.3", "resolved_path": "/abs/path" }],
  "local_dependencies": [...],
  "local_dev_dependencies": [...],
  "tree"?: { ... }
}
```

- Markdown exports in `shared/report/md.ts` mirror the JSON structure (sections for global/local/dev) and `shared/cli/parser.ts` parses them back into the same schema. Keep column ordering and headers stable so round-trips succeed.
- Bun's scanners (`src/runtimes/bun/package-manager.ts`) inspect `node_modules` and Bun's global install directory directly; do not regress the normalized dependency map they feed into `buildReportFromNpmTree`.

## Testing Guidelines

- Create Vitest specs next to the implementation; rely on snapshots only for CLI help text because dependency ordering must remain deterministic.
- Use `npm.test.ts` and `cli.test.ts` as guides for mocking npm output and Commander invocations; stub shell calls so tests pass without global packages.
- Before pushing, run `npm run lint && npm test` to confirm parsers, report writers, and runtime shims remain stable.
- Use `src/shared/cli/install.test.ts` to validate multi-PM install flows and `src/runtimes/bun/package-manager.test.ts` as the contract for Bun's package discovery logic (local/global coverage, omit-dev semantics, and fallback scanning).

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits (`feat:`, `chore(npm):`, `feat!: breaking`); include scopes when touching shared tooling.
- Every PR should state intent, list CLI or schema changes, link issues, attach CLI output screenshots when output changes, and add a Changeset when user-facing output shifts.
- Confirm build, lint, and tests succeed locally; CI mirrors `npm run build && npm test`, so catching failures early avoids churn.

## Security & Configuration Tips

- Enforce Node `>=20` locally and in CI to match the runtime features compiled by `tsup`.
- Avoid committing real `gex-report.json` snapshots from clients; scrub data and rely on fixtures like `global.md`.
- Maintain argument sanitization in `src/npm.ts` before spawning npm commands to prevent shell injection when paths or flags are user supplied.
- When testing Bun paths (especially in CI), the env vars `GEX_BUN_GLOBAL_ROOT` and `GEX_BUN_LOCAL_ROOT` can override auto-detected directories so mocks don't touch real installs.
