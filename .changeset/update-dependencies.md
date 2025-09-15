---
'@yabasha/gex': major
---

BREAKING CHANGE: Update all dependencies to latest versions and increase Node.js requirement

**Breaking Changes:**

- **Node.js engine requirement updated from >=18.18 to >=20** (required by commander v14)
  - Users on Node.js 18.x must upgrade to Node.js 20+ to use this version
  - Node.js 18.x support dropped due to dependency requirements

**Dependency Updates:**

- Updated @types/node from ^22.5.4 to ^24.4.0 (major)
- Updated eslint-config-prettier from ^9.1.0 to ^10.1.8 (major)
- Updated lint-staged from ^15.2.10 to ^16.1.6 (major)
- Updated commander from ^12.1.0 to ^14.0.1 (major)
- Updated vitest from ^2.1.1 to ^3.2.4 (major)
- Updated @changesets/cli from ^2.27.8 to ^2.29.7 (minor)

**Security & Quality:**

- Resolved 5 moderate security vulnerabilities in development dependencies
- All tests continue to pass and build succeeds with updated dependencies
- Pre-commit hooks and linting verified to work correctly
