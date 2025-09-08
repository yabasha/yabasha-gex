---
'@yabasha/gex': minor
---

- Implement GEX CLI with default `local` (root) command and `global` command
- Support JSON (default) and Markdown outputs, with `--full-tree` including raw npm JSON
- Fix option parsing for subcommands so `-o` and `-f` are respected (e.g., `gex global -f md -o global.md`)
- Add ASCII help banner (Option B), README/WARP docs, and initial tests
