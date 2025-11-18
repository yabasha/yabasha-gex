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

### Top-level entry: `gex` (interactive selector)

Starting with v1.3.5, the primary `gex` binary is an interactive launcher that lets you choose which runtime to use:

```bash
gex
```

You will be prompted with:

```text
Select a runtime to use:
  1) gex-bun (Bun package manager)
  2) gex-npm (npm / Node.js package manager)
```

Enter `1` for the Bun-based CLI (`gex-bun`) or `2` for the Node/npm-based CLI (`gex-npm`). Any additional arguments you pass after `gex` are forwarded to the selected runtime, e.g.:

```bash
gex local --check-outdated   # choose Bun or npm, then run `local` on that runtime
```

### Direct runtimes: `gex-npm` (Node) and `gex-bun` (Bun)

You can still call each runtime directly without the interactive selector:

```bash
gex-npm [command] [options]   # Node.js / npm runtime (formerly `gex`)
gex-bun [command] [options]   # Bun runtime
```

Common command options:

- -f, --output-format <md|json> (default: json)
- -o, --out-file <path>
- --full-tree Include the full npm ls JSON under `tree` (default uses depth=0)
- --omit-dev Local only; exclude devDependencies
- -c, --check-outdated Print a table of outdated packages (shows a lightweight spinner while checking; skips console report output unless `-o` is set so you can write the report to file instead)
- -u, --update-outdated [pkg1 pkg2 ...] Update outdated packages (omit names to update everything). Node CLI shells out to `npm update`; Bun CLI mirrors `bun update` for locals and reinstalls globals via `bun add -g pkg@latest`.

Examples (Node/npm runtime via `gex-npm`):

```bash
# Local (default): JSON output to console
gex-npm                 # prints JSON to console (same as: gex-npm local)
gex-npm -o report.json  # writes JSON to file
gex-npm -f md           # prints markdown to console
gex-npm -f md -o report.md  # writes markdown to file

# Local: exclude devDependencies
gex-npm local --omit-dev          # prints JSON to console
gex-npm local --omit-dev -o deps.json  # writes JSON to file

# Global packages
gex-npm global                    # prints JSON to console
gex-npm global -o global.json     # writes JSON to file
gex-npm global -f md              # prints markdown to console

# Read a previous report (JSON or Markdown)
# Default prints names@versions; add -i to install
# Positional path or -r/--report are accepted
# JSON
gex-npm read
gex-npm read -r path/to/report.json -i
# Markdown
gex-npm read global.md
gex-npm read global.md -i

# Shell redirection (alternative to -o flag)
gex-npm > report.json                # redirect JSON output to file
gex-npm global | jq '.global_packages'  # pipe output to jq for processing

# Check outdated packages / update them (Node runtime)
gex-npm local --check-outdated                    # show outdated local deps as a table
gex-npm global -c                                 # short flag works too
gex-npm local --update-outdated                   # update every outdated local dependency
gex-npm local -u axios react                      # update specific packages

# Bun runtime uses the same flags with Bun semantics
gex-bun local --check-outdated
gex-bun global --update-outdated              # updates global Bun installs via `bun update`/`bun add -g`
```

> **Note**: Starting from v0.4.0, GEX outputs to console by default instead of creating files automatically. Use the `-o/--out-file` flag to write to a file.

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

## Outdated workflow

- Use `-c/--check-outdated` to produce a focused table of outdated packages. GEX shows a lightweight spinner while it queries npm, then prints `Name`, `Current`, `Wanted`, `Latest`, and `Type`. Combine the flag with `-o report.json` if you still need the report file.
- Use `-u/--update-outdated` to upgrade packages. Without arguments every outdated package is updated; include package names to only bump a subset (e.g., `-u axios react`). Node CLI shells out to `npm update`, whereas Bun CLI runs `bun update` for local projects and `bun add -g pkg@latest` for globals.
- After updating you can immediately rerun `-c` to verify everything is current—reports generated with `-o` will now include the updated versions.

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
