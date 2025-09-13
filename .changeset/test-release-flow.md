---
'@yabasha/gex': patch
---

chore(release): test CI/CD flow by adding a no-op changeset.

- Ensures the Release workflow opens a "Version Packages" PR
- After merging that PR, publish should run with a build step
