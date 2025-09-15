---
'@yabasha/gex': minor
---

Changed default output behavior to print JSON to console instead of writing to file automatically.

- `gex local` and `gex global` now print JSON output to console by default
- File output now requires explicit `-o/--out-file` flag
- Added shell redirection examples to documentation
- No breaking changes - existing `-o` functionality remains unchanged
