## Security posture notes – 2025-11-27

### Identified advisories
- `esbuild` / `vite` / `vite-node` / `vitest` – GHSA-67mh-4wv8-2f99 (frontend toolchain).
- `mssql` → `tedious` / `@azure/identity` – GHSA-m5vv-6r4h-3vj9 (backend SQL client).

### Remediation actions
- `npm install --prefix api mssql@12.1.1`
- `npm install --prefix web vite@7.2.4 vitest@4.0.14`

### Verification
- `npm test --prefix api` ✅
- `npm audit --production --prefix api` → `found 0 vulnerabilities`
- `npm audit --production --prefix web` → `found 0 vulnerabilities`

All previously reported moderate vulnerabilities are now closed. Track future dependency warnings and update this log with date/time, action, and evidence.