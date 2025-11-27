# Architectural Decision: Web Application Access Layer

## Decision
- **Chosen option:** Custom App Service API (Managed Identity + Key Vault)
- **Status:** Accepted on 2025-11-27.
- **Scope:** Deliver an operational Azure web application within 1 hour covering all MVP use cases and user stories, meeting ISO 25000 quality standards, and operating without existing CI/CD pipelines.

## Rationale
- Keeps database credentials and logic server-side, aligning with security and maintainability requirements.
- Allows full control over query optimisation, validation, and logging needed for historical DB workloads.
- Managed identity plus Key Vault eliminates hard-coded secrets and prepares us for the future AI assistant.
- Fits incremental delivery: manual deployment now, automation-friendly later.

## Consequences
- We must provision App Service, Key Vault, Azure SQL permissions, and supporting resources before frontend functionality.
- Requires disciplined test automation and deployment checklists because pipelines are absent.
- Additional operational overhead (monitoring, logs) must be configured manually until CI/CD exists.

---

# Step-by-Step Execution Guide (manual deployment, no pipelines)

Follow the steps sequentially. After each step, append the actions and results to `conversation_history.md` to satisfy traceability.

### Step 1: Pre-flight checks
- Confirm Azure subscription access (Contributor) and local tooling: `node -v`, `npm -v`, `az version` from Azure Cloud Shell bash.
- Pull latest repo changes, document current git commit in `conversation_history.md`.
- **Verification:** `az account show --output table` returns the expected subscription and tenant.

### Step 2: Azure resource groundwork
- Ensure resource group `Upkip-KlingerWesta` exists
- Confirm Azure SQL server & database (`HistoricalDB`). 
- Add your public IP to the SQL firewall (per `azure_setup.md`) to allow validation queries.
- **Verification:** Execute a read-only `SELECT TOP (5)` against `OCUSMA` using Azure Data Studio or Portal query editor.

### Step 3: App Service plan, Web App, and monitoring
- Create Linux App Service plan (S1) and App Service `upklinge-hdbt` targeting Node 24 LTS.
- Enable system-assigned managed identity on the App Service.
- Create/attach an Application Insights instance for telemetry.
- **Verification:** Browse the default site, ensure HTTP 200, confirm App Insights receives availability pings.

### Step 4: Secure database access
- In Azure SQL, connect as Azure AD admin and create a contained user for the managed identity:
  ```
  CREATE USER [hdb-api-web] FROM EXTERNAL PROVIDER;
  EXEC sp_addrolemember 'db_datareader', 'hdb-api-web';
  ```
- If future writes are needed, document the `db_datawriter` assignment but keep MVP read-only.
- **Verification:** Use `sqlcmd` with Azure AD authentication to run the query as your user and confirm read access works; plan to validate the managed identity in Step 7.

### Step 5: Key Vault configuration
- Create Key Vault `kv-hdb-prod` (same region) and add secrets: `SqlServerUrl`, `SqlDatabaseName`, `FrontEndOrigin`.
- Grant the App Service managed identity `get` and `list` permissions for secrets.
- **Verification:** From Azure Cloud Shell run `az keyvault secret show`, and from the App Service console use `curl` to confirm the identity can retrieve secrets.

### Step 6: Backend project scaffold with TDD
- In the repo root, `mkdir api && cd api`, run `npm init -y`.
- Install dependencies: `express`, `cors`, `mssql`, `@azure/identity`, `@azure/keyvault-secrets`. Dev dependencies: `typescript`, `ts-node-dev`, `jest`, `ts-jest`, `supertest`, `eslint`.
- Generate `tsconfig.json`, `jest.config.ts`, and `src/` structure (`config`, `routes`, `services`, `tests`).
- Write the first failing tests (e.g., `health` endpoint) before implementation; follow TDD for each feature slice (customers, suppliers, orders).
- **Verification:** `npm test` passes after implementing endpoints; `npm run dev` serves `/api/health` responding `{ status: 'ok' }`.

### Step 7: Data access layer & query tuning
- Implement a centralized SQL client using `DefaultAzureCredential` locally and the managed identity on App Service. Ensure pooling and parameterised queries.
- Build repository functions covering:
  - Customer search (supports filters listed in user stories; join `OCUSMA`, `OOHEAD`, `OOLINE`, `MITMAS` with pagination).
  - Supplier lookup (`CIDMAS`, `CIDARD`).
  - Customer orders for a given customer (per `01_use_cases.md`).
- Add unit tests mocking DB calls and integration tests hitting Azure SQL (limit results with `TOP (50)` to stay performant).
- **Verification:** Run integration tests with environment variables pointing to Azure SQL; capture execution time (<500 ms) and document results.

### Step 8: Frontend application build
- From repo root, `mkdir web && cd web`, run `npm create vite@latest web -- --template react-ts`.
- Integrate `source/main.css` and assets (`KLINGERWestad_hires.png`, `Upkip-brand-assets-gray-2048x559.png`); configure favicon/site icon.
- Implement pages for dashboard, customers, suppliers, and orders using components that call backend APIs while respecting the filters from user stories.
- Add UI tests with Vitest + Testing Library for key scenarios.
- **Verification:** `npm test` passes; `npm run dev` shows the branded layout with mocked API data.

### Step 9: Local end-to-end validation
- Run backend (`npm run dev` in `api`) and frontend (`npm run dev` in `web`) concurrently; configure `.env` so the frontend targets `http://localhost:3000`.
- Execute manual scenarios:
  - Search customers by name “Hyundai Heavy” and confirm expected entries appear from live data.
  - Inspect supplier details and addresses.
  - View customer orders and BOM drill-down.
- **Verification:** Record screenshots, note response times, and log results in `conversation_history.md`.

### Step 10: Production configuration & build artifacts
- Configure backend production settings: compression, CORS allow-list (frontend origin), error handling.
- Build frontend `npm run build` (outputs to `web/dist`).
- Copy `web/dist` into `api/public` and configure Express static middleware for SPA fallback.
- **Verification:** Run `NODE_ENV=production npm start` locally, serve static files and API from the same server, ensure routing works via `curl` and browser.

### Step 11: Manual deployment to App Service
- Package deployment artifact: `cd api && npm run build && zip -r ../deploy.zip .`
- Use `az webapp config appsettings set` to configure `KEY_VAULT_URI`, `NODE_ENV`, `APPINSIGHTS_INSTRUMENTATIONKEY`.
- Deploy: `az webapp deploy --resource-group rg-hdb-web --name hdb-api-web --type zip --src-path ../deploy.zip`
- **Verification:** `az webapp log tail` shows successful startup; browse the production URL, repeat key scenarios, confirm telemetry in App Insights.

### Step 12: Acceptance, documentation, and handover
- Update `conversation_history.md` with final deployment notes, test evidence, and outstanding issues.
- Prepare release notes summarising implemented endpoints, tests, performance metrics.
- Seek user acceptance; once approved, commit changes with a conventional message (`feat: initial azure web app mvp`) and wait for explicit approval before pushing.
- Capture follow-up tasks (pipeline automation, cache strategy, AI assistant) in the backlog.

---

### Immediate Next Actions
1. Acknowledge this decision in stand-up/status.
2. Time-box Steps 1–4 to 15 minutes to keep the delivery window realistic.
3. Flag any blockers (Azure permissions, data access) immediately.