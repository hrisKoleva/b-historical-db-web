# Refactoring / Cleanup Tasks (excluding `01_requirements/`)

## Frontend (`web/`)
- **Remove stale build artifacts from source tree**
  - `web/dist/` should stay untracked; the current contents (JS/CSS bundle and assets) appear committed.
  - Consider pruning generated files (`vite.config.d.ts`, `vite.config.js`) if they were produced transiently and the TypeScript source `vite.config.ts` is authoritative.
- **Consolidate TypeScript build info files**
  - Investigate whether both `tsconfig.node.tsbuildinfo` and `tsconfig.tsbuildinfo` need to persist in git; usually they are transient and can go into `.gitignore`.

## Backend (`api/`)
- **Clean `dist/` directory from source control**
  - Compiled JS files, bundled public assets, and test outputs under `api/dist/` should be generated during CI/CD, not committed.
  - Add `api/dist/` to `.gitignore` if it’s meant to be build output only.
- **Review redundant artifacts**
  - Ensure only `tsconfig.json` and `tsconfig.eslint.json` are required; remove any unused compiler configs.
  - Examine copied `public/` assets in `api/dist/`—if they originate from `web/dist/`, rely on the build pipeline instead of keeping a static copy in source.

## Repository Root
- **Delete the unused `apiweb/` folder**
  - It contains only a `package.json` with `jsdom` and no source—likely a leftover experiment. Removing it simplifies dependency management.
- **Verify `.gitignore` coverage**
  - After removing `dist/` directories, ensure they’re listed in `.gitignore` so future builds don’t reintroduce generated files.


