# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GEX is a Node.js CLI tool for auditing and documenting package dependencies. It generates structured reports of both local project dependencies and globally installed packages, with output in JSON or Markdown format. The tool also supports reading and installing from previous reports.

## Development Commands

```bash
# Install dependencies
npm install

# Build the project (creates dist/ with both library and CLI bundles)
npm run build

# Development with watch mode (rebuilds and shows CLI help on success)
npm run dev

# Run tests (Vitest)
npm test

# Watch tests
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Test the CLI locally after building
node dist/cli.cjs --help
```

## Architecture

### Core Components

- **CLI Entry Point** (`src/cli.ts`): Main command-line interface using Commander.js with three commands:
  - `local` (default): Generate reports for current project dependencies
  - `global`: Generate reports for globally installed packages
  - `read`: Parse and install from existing reports (JSON or Markdown)

- **npm Integration** (`src/npm.ts`): Handles interaction with npm commands (`npm ls`, `npm root -g`)

- **Data Transformation** (`src/transform.ts`): Converts npm ls output into standardized Report format

- **Report Generation**:
  - `src/report/json.ts`: JSON report renderer
  - `src/report/md.ts`: Markdown report renderer

- **Type Definitions** (`src/types.ts`): Core types (Report, PackageInfo, OutputFormat)

- **Library API** (`src/index.ts`): Placeholder library exports (currently just a greet function)

### Build System

Uses tsup with dual configuration:

1. **Library build**: ESM/CJS formats with TypeScript definitions for npm package consumers
2. **CLI build**: Executable with shebang for command-line usage

Output files:

- `dist/index.{mjs,cjs}` + `dist/index.d.ts`: Library API
- `dist/cli.{mjs,cjs}`: CLI executable (package.json bin points to cli.cjs)

### Report Format

Reports contain:

- Metadata: report_version, timestamp, tool_version
- Package arrays: global_packages, local_dependencies, local_dev_dependencies
- Optional: project_name, project_version (for local reports), full npm tree

### Testing

- Uses Vitest for testing
- Test files located in `src/` directory as `*.test.ts`
- Single test file currently: `src/index.test.ts`

## Key Patterns

1. **Dual Output Support**: Both JSON (machine-readable) and Markdown (human-friendly) formats
2. **npm CLI Integration**: Wraps npm commands with error handling for cross-platform compatibility
3. **Report Bidirectionality**: Can generate reports and later read/install from them
4. **Modular Design**: Clear separation between CLI logic, npm interaction, data transformation, and rendering

## Dependencies

- **Runtime**: commander (CLI framework)
- **Development**: TypeScript, tsup (bundler), Vitest (testing), ESLint, Prettier
- **CI/CD**: Changesets for versioning, GitHub Actions for CI/release
