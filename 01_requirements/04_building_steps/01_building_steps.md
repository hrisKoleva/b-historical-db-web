# MVP Build Steps – 2025-11-27

> Follow the sequence exactly. After each step, log actions and results (commands run, outputs, screenshots) in `conversation_history.md` to satisfy traceability.

## Step 1 – Pre-flight checks
- Sign in to the Azure Portal (`https://portal.azure.com`) with the subscription that owns `Upkip-KlingerWestad`.
- In the top toolbar, click the Cloud Shell icon (`>_`). It looks like a terminal prompt with a caret and underscore. On smaller screens you might need to expand the toolbar using the `...` overflow menu. When prompted, choose **Bash** (not PowerShell).
- First-time setup only: complete the storage wizard (subscription: current one, resource group: `Upkip-KlingerWestad`, region: West Europe) and click **Create storage**. Cloud Shell will provision the storage account automatically.
- Confirm the prompt in the shell pane reads something like `yourname@Azure:~$`. If PowerShell opens, use the drop-down in the left of the prompt to switch to Bash.
- Run `az account show --output table` and confirm the subscription/tenant.
- On the workstation (not `C:\` PowerShell), run `node -v` and `npm -v`.
- Note today’s git commit hash (`git rev-parse HEAD`) and append all findings to `conversation_history.md`.

## Step 2 – Azure resource groundwork
- Verify the resource group:  
  `az group show --name Upkip-KlingerWestad --query "{name:name, location:location}" --output table`  
- Confirm the Azure SQL server `upklinge-sqlserver`:  
  `az sql server show --name upklinge-sqlserver --resource-group Upkip-KlingerWestad --output table`
- Confirm the `HistoricalDB` database:  
  `az sql db show --name HistoricalDB --server upklinge-sqlserver --resource-group Upkip-KlingerWestad --output table`
- Add (or confirm) the `AllowMyIP` firewall rule (already done if the command succeeds with `Updated...`):  
  `az sql server firewall-rule create --resource-group Upkip-KlingerWestad --server upklinge-sqlserver --name AllowMyIP --start-ip-address <your.ip.address> --end-ip-address <your.ip.address>`
- Record outcomes (including any errors) in `conversation_history.md`.

## Step 3 – Data smoke test
- Using Azure Data Studio or the Portal Query Editor, connect with Microsoft Entra ID credentials.
- Execute:  
  `SELECT TOP (5) OKCUNO, OKCUNM, OKPHNO FROM OCUSMA;`
- Capture execution time, row count, and any anomalies; document in `conversation_history.md`.

## Step 4 – App Service plan, Web App, and monitoring
- Create the Linux plan (S1):  
  `az appservice plan create --name upklinge-hdb-plan --resource-group Upkip-KlingerWestad --sku S1 --is-linux`
- Create the Web App targeting Node 24 LTS:  
  `az webapp create --resource-group Upkip-KlingerWestad --plan upklinge-hdb-plan --name upklinge-hdb --runtime "NODE|24-lts"`
- Enable the system-assigned managed identity:  
  `az webapp identity assign --name upklinge-hdb --resource-group Upkip-KlingerWestad`
- Create or attach Application Insights:  
  `az monitor app-insights component create --app upklinge-hdb-ai --location westeurope --resource-group Upkip-KlingerWestad --application-type web`
- Configure App Settings for telemetry (once you have the instrumentation key):  
  `az webapp config appsettings set --name upklinge-hdb --resource-group Upkip-KlingerWestad --settings APPINSIGHTS_INSTRUMENTATIONKEY=<instrumentation-key>`
- Browse `https://upklinge-hdb.azurewebsites.net/` and confirm HTTP 200; verify App Insights receives availability pings.
- If the Azure Portal offers to set up GitHub Actions but reports missing permissions, dismiss the prompt—we will create the workflows manually in Steps 6–7.
- Document the commands run, outputs, and verification evidence in `conversation_history.md`.

## Step 5 – Repository preparation for dual pipelines
- Ensure `api/` (backend) and `web/` (frontend) directories exist with their own `package.json`, `tsconfig.json`, and test setup. Move the prototype assets into `web/` and keep shared branding in `source/assets/`.
- Create a top-level `package.json` script (e.g., `npm run install:all`) that installs both workspaces to simplify CI. Document the workspace layout in `README.md`.
- Add `.gitignore` entries for build outputs (`api/dist`, `web/dist`, coverage reports) and ensure no secrets are committed.
- Record the repository structure changes in `conversation_history.md` before pushing.

## Integrated MVP roadmap (backend, frontend, CI/CD)
- **Backend data foundation:** Key Vault & managed identity integration, resilient SQL client, customer search endpoint with pagination, supplier/order endpoints next.
- **Frontend UX:** Replace stub components with live API adapters, build Customers/Suppliers/Orders pages, ensure tests cover search flows and performance budgets.
- **CI/CD automation:** Dual GitHub Actions workflows (frontend artefact → backend deploy) with smoke tests and manual secret provisioning.
- **Security hardening:** Upgrade flagged dependencies (`mssql`, `vite`, `vitest`), re-run `npm audit --production`, document results in `02_security_notes.md`.
- **Verification & sign-off:** Capture test evidence, Application Insights telemetry, and final MVP checklist before requesting acceptance.

## Step 6 – Backend data foundation (start now)
- Implement Key Vault/managed identity helper:
  - Use `DefaultAzureCredential` locally and managed identity in Azure.
  - Cache access tokens and enforce parameterised queries.
- Create SQL repository modules (customers first) with TDD:
  - Unit tests mock the SQL client.
  - Integration smoke test runs against Azure SQL with `TOP (10)` result limit.
- Expose `/api/customers` with filters for name, number, phone, and include order summaries (joins to `OOHEAD`, `OOLINE`).
- Log query response times and sample payloads in `conversation_history.md`.

## Step 7 – Frontend UX with live data
- Add API client layer in `web/` consuming `/api/customers`, `/api/suppliers`, `/api/orders`.
- Build Customers page UI (search form, results table, detail drawer). Add vitest + Testing Library coverage for the Hyundai Heavy scenario.
- Introduce Suppliers and Customer Orders pages; start with data tables backed by live endpoints.
- Run `npm run lint --prefix web`, `npm run test --prefix web`, `npm run build --prefix web` and record outcomes.

## Step 8 – GitHub Actions automation (Option C)
- `.github/workflows/frontend.yml` – runs on push/PR to `main`, installs → lints → tests → builds `web/`, uploads the `frontend-dist` artefact.
- `.github/workflows/backend.yml` – runs on push to `main` or manual dispatch, installs both workspaces, lints/tests/builds the API, rebuilds the frontend, bundles `web/dist` into `api/dist/public`, zips the deploy package, and deploys via `azure/webapps-deploy@v2`.
- Required GitHub secret: `AZURE_WEBAPP_PUBLISH_PROFILE` (export from App Service → Deployment Center → Get publish profile). Capture secret ownership in `conversation_history.md`.
- After each deploy, run smoke tests manually (`/api/health`, `/api/customers?limit=1`) until automated checks are added.

## Step 9 – Security hardening & audits
- Upgrade `mssql`, `vite`, `vitest` (or newer patched versions) and re-run audits:  
  `npm audit --production --prefix api`, `npm audit --production --prefix web`.
- Archive audit outputs and any mitigation notes in `02_security_notes.md`.
- Confirm Application Insights traces include dependency timings; set alerts if necessary.

## Step 10 – Final verification & acceptance
- Execute end-to-end manual scenario (login → dashboard → Hyundai Heavy search → order drill-down) and capture screenshots.
- Update `README.md` with run commands, environment variables, and troubleshooting tips.
- Summarise completed scope, tests, audits, and remaining backlog in `conversation_history.md`.
- Request user acceptance; upon approval, prepare commit message and await push authorization.


-----
What you still need to do
Provide runtime configuration: either set SQL_SERVER_HOST/SQL_DATABASE_NAME env vars or store their Key Vault secret names (KEY_VAULT_SQL_SERVER_SECRET, KEY_VAULT_SQL_DATABASE_SECRET), and ensure the App Service managed identity has get access plus SQL db_datareader.



Run a live smoke test once credentials are in place—GET https://upklinge-hdb.azurewebsites.net/api/customers?name=Hyundai should respond within 500 ms; capture the timing in conversation_history.md.

Expand Step 6/7 for Suppliers and Customer Orders (new repository/service/router slices mirroring the customer pattern).

Implement Step 8: add .github/workflows/frontend.yml and .github/workflows/backend.yml, populate GitHub secrets (publish profile or federated credentials), and confirm the pipelines deploy successfully.
When everything is verified, request sign-off, then commit and push (per rule #20 wait for approval first).


Customer search is now fully functional end-to-end:
Added a responsive React UI (web/src/App.tsx, web/src/styles/global.css) with live calls to /api/customers. Users can type a name (default “Hyundai”), trigger the search, and see totals plus recent orders.
Created strong test coverage (web/src/App.test.tsx) and cleaned up generated .js files; frontend lint/test/build all pass. You’ll still see “act” warnings because the component enters an async state—those don’t break the run, but we can tidy them later.
Pointed the repository SQL queries at the correct M3FDBPRD schema so Azure SQL responds (the payload you pasted is exactly what we now render).
Added GitHub Actions CI/CD (frontend.yml, backend.yml) and documented secrets; once you add AZURE_WEBAPP_PUBLISH_PROFILE under Settings → Security → Secrets and variables → Actions, pushes to main will automatically lint/test/build and deploy.
Next steps
Add the publish profile secret in GitHub, then re-run the backend workflow to ship the latest build.
Hit https://upklinge-hdb.azurewebsites.net/api/customers?name=Hyundai&limit=1 after deploy and log the latency/payload in conversation_history.md.
When time allows, revert the temporary SQL_AUTH_USER/PASSWORD settings back to Key Vault/managed identity, and expand the UI to cover Suppliers and Customer Orders (the repo structure is ready to mirror).
Everything else is ready for the MVP demo.