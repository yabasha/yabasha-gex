```
  ________                __
 /  _____/  ____   _____/  |_  ____   ____
/   \\  ___ /  _ \\ /  _ \\   __\\/ __ \\ /    \\
\\    \\_\\  (  <_> |  <_> )  | \\  ___/|   |  \\
 \\______  /\\____/ \\____/|__|  \\___  >___|  /
        \\/                         \\/     \\/
                      GEX

```

# GEX — Global/local dependency auditing and documentation for Node.js

GEX is a focused CLI that generates structured, reproducible reports of your Node.js package environments:

- Local project dependencies (default)
- Globally installed packages

Reports can be emitted as machine-readable JSON (default) or human-friendly Markdown. Use GEX to inventory environments, document state for handovers/audits, and keep a versionable dependency log.

## Install

- Requirements: Node >= 18.18, npm
- Global install:

```bash
npm i -g @yabasha/gex
```

Or run locally after building this repo:

```bash
npm i
npm run build
node dist/cli.cjs --help
```

## Usage

Synopsis:

```bash
gex [options]          # defaults to: gex local
gex local [options]
gex global [options]
```

Common options:

- f, --output-format <md|json> (default: json)
- o, --out-file <path>
- -full-tree Include the full npm ls JSON under `tree` (default uses depth=0)
- -omit-dev Local only; exclude devDependencies

Examples:

```bash
# Local (default): JSON → stdout or to default file if -f provided without -o
gex                  # same as: gex local
gex -f md -o report.md

# Local: exclude devDependencies
gex local --omit-dev -f json -o deps.json

# Global packages
gex global -f md -o global.md

# Read a previous report (JSON or Markdown)
# Default prints names@versions; add -i to install
# Positional path or -r/--report are accepted
# JSON
gex read
gex read -r path/to/report.json -i
# Markdown
gex read global.md
gex read global.md -i
```

## JSON schema (summary)

Top-level keys:

- report_version, timestamp, tool_version
- project_name, project_version (omitted for global reports)
- global_packages: Array<{ name, version, resolved_path }>
- local_dependencies: Array<{ name, version, resolved_path }>
- local_dev_dependencies: Array<{ name, version, resolved_path }>
- tree: raw `npm ls --json` output (when --full-tree)

Example (truncated):

```json
{
  "report_version": "1.0",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "tool_version": "0.1.0",
  "project_name": "my-app",
  "project_version": "1.2.3",
  "global_packages": [],
  "local_dependencies": [
    {
      "name": "commander",
      "version": "12.1.0",
      "resolved_path": "/path/to/project/node_modules/commander"
    }
  ],
  "local_dev_dependencies": [
    {
      "name": "vitest",
      "version": "2.1.1",
      "resolved_path": "/path/to/project/node_modules/vitest"
    }
  ]
}
```

## Production usage

- Deterministic output: packages are sorted by name; default uses depth=0 for fast, stable runs.
- Exit codes: returns 0 on success; non-zero on fatal errors (e.g., npm not found, unreadable output).
- npm behavior: npm ls may exit non-zero but still produce JSON; GEX parses stdout when available.
- Paths: resolved_path is best-effort from npm and environment (uses `npm root -g` for global discovery).

CI/CD examples:

- Using npx (no global install):

```bash
npx -y @yabasha/gex@latest -f json -o gex-report.json
```

- GitHub Actions step snippet:

```yaml
- name: Generate dependency report
  run: npx -y @yabasha/gex@latest -f json -o gex-report.json
```

## Development (repo)

```bash
npm i
npm run build
npm test
npm run dev      # watch + shows CLI help on success
npm run lint
```

## Contribute

We welcome contributions! A quick guide to getting productive:

- Setup
  - Fork and clone this repo, then: `npm i`
  - Dev loop: `npm run dev` (rebuilds and prints CLI help on successful build)
  - One-off build: `npm run build`, then run: `node dist/cli.cjs --help`
- Test, lint, format
  - Run tests: `npm test` (or `npm run test:watch`) — uses Vitest
  - Lint: `npm run lint`; Format: `npm run format`
- Adding features/fixes
  - Create a branch (e.g., `feat/read-reports`, `fix/option-parsing`)
  - Make changes and add tests when reasonable
  - If the change is user-facing, add a changeset: `npx changeset` (choose bump; write a summary)
- Open a PR (use `gh` CLI per workspace convention)
  - Example: `gh pr create --fill` (ensure your branch is pushed)
  - CI will run tests and build; the Release workflow will open a "Version Packages" PR for changesets
  - Merge the "Version Packages" PR to publish to npm automatically
- Quick local verification
  - Generate a report: `gex -f json -o gex-report.json`
  - Read a report: `gex read` (JSON) or `gex read global.md` (Markdown); add `-i` to install
