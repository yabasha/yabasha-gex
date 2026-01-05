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
- **Global install (npm)**:

  ```bash
  npm i -g @yabasha/gex
  ```

- **Global install (Bun)**:

  ```bash
  bun add -g @yabasha/gex
  ```

- **Local Build / Development**:

  clone the repository and run:

  **Using npm**:

  ```bash
  npm i
  npm run build
  node dist/cli.cjs --help
  ```

  **Using Bun**:

  ```bash
  bun install
  bun run build
  bun dist/cli-bun.mjs --help
  ```

## Usage

### Top-level entry: `gex` (interactive launcher)

Starting with v1.3.6, the primary `gex` binary is an interactive launcher that lets you choose both:

- Which runtime to use: Node/npm (`gex-node`) or Bun (`gex-bun`)
- Which command to run: `local`, `global`, or `read`

Run:

```bash
gex
```

You will see a menu similar to:

```text
GEX interactive launcher
Choose a runtime and command to run:

  1) gex-node local  – Node (npm) local project report
  2) gex-node global – Node (npm) global packages report
  3) gex-node read   – Node (npm) read existing report
  4) gex-bun local   – Bun local project report
  5) gex-bun global  – Bun global packages report
  6) gex-bun read    – Bun read existing report
  q) Quit without running anything
```

After selecting an option (for example, `1`), GEX shows the base command and asks for any extra flags you want to include:

```text
Selected: gex-node local
Enter extra flags/arguments for "gex-node local" (or press Enter for none):
```

Anything you type here is used to build and execute the final command. For example:

- Input: `--full-tree -f md -o report.md`
- Executed command: `gex-node local --full-tree -f md -o report.md`

If you run `gex` **with arguments** (for example `gex local --check-outdated`), it behaves like `gex-node` for backward compatibility and forwards those arguments to the Node runtime.

### Direct runtimes: `gex-node` (Node) and `gex-bun` (Bun)

You can also call each runtime directly without the interactive launcher:

```bash
gex-node [command] [options]   # Node.js / npm runtime (formerly `gex`)
# Alias: gn

gex-bun [command] [options]    # Bun runtime
# Alias: gb
```

Common command options:

- -f, --output-format <md|json> (default: json)
- -o, --out-file <path>
- --full-tree Include the full npm ls JSON under `tree` (default uses depth=0)
- --omit-dev Local only; exclude devDependencies
- -c, --check-outdated Print a table of outdated packages (shows a lightweight spinner while checking; skips console report output unless `-o` is set so you can write the report to file instead)
- -u, --update-outdated [pkg1 pkg2 ...] Update outdated packages (omit names to update everything). Node CLI shells out to `npm update`; Bun CLI mirrors `bun update` for locals and reinstalls globals via `bun add -g pkg@latest`.

Examples (Node/npm runtime via `gex-node`):

```bash
# Local (default): JSON output to console
gex-node                 # prints JSON to console (same as: gex-node local)
gex-node -o report.json  # writes JSON to file
gex-node -f md           # prints markdown to console
gex-node -f md -o report.md  # writes markdown to file

# Local: exclude devDependencies
gex-node local --omit-dev              # prints JSON to console
gex-node local --omit-dev -o deps.json  # writes JSON to file

# Global packages
gex-node global                        # prints JSON to console
gex-node global -o global.json         # writes JSON to file
gex-node global -f md                  # prints markdown to console

# Read a previous report (JSON or Markdown)
# Default prints names@versions; add -i to install
# Positional path or -r/--report are accepted
# JSON
gex-node read
gex-node read -r path/to/report.json -i
# Markdown
gex-node read global.md
gex-node read global.md -i

# Shell redirection (alternative to -o flag)
gex-node > report.json                     # redirect JSON output to file
gex-node global | jq '.global_packages'    # pipe output to jq for processing

# Check outdated packages / update them (Node runtime)
gex-node local --check-outdated                    # show outdated local deps as a table
gex-node global -c                                 # short flag works too
gex-node local --update-outdated                   # update every outdated local dependency
gex-node local -u axios react                      # update specific packages

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
