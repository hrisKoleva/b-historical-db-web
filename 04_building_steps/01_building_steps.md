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

## Step 6 – GitHub Actions: Frontend pipeline (Option C)
- Create `.github/workflows/frontend.yml` with:
  - Trigger on `push` and `pull_request` to `main`.
  - Jobs: checkout, set up Node 20/22 (match local), install deps under `web/`, run unit tests (`npm test -- --run`), run lint, build production bundle (`npm run build`).
  - Publish the build artefact (`web/dist`) using `actions/upload-artifact` named `frontend-dist`.
- Store required environment variables (API base URL for tests) in GitHub repository secrets or workflow `env`.
- Verify locally that `npm run build` succeeds before the first push to avoid failing runs.

## Step 7 – GitHub Actions: Backend pipeline (Option C)
- Create `.github/workflows/backend.yml` configured to trigger on `workflow_run` completion of `frontend.yml` (status success) and on manual dispatch.
- Jobs should: checkout repository, set up Node, install backend dependencies under `api/`, run unit and integration tests (mocking DB where necessary), download the `frontend-dist` artefact, copy its contents into `api/public/`, and build the backend (`npm run build`).
- Deploy to Azure App Service using `azure/webapps-deploy@v2` (or `azure/CLI@v1`), authenticating via a publish profile or federated credentials stored in GitHub secrets (`AZURE_WEBAPP_PUBLISH_PROFILE` or `AZURE_CREDENTIALS`).
- After deployment, run a smoke test step (e.g., `curl https://upklinge-hdb.azurewebsites.net/api/health`) to fail fast if the app is unreachable.

## Step 8 – Initial pipeline run and monitoring
- Commit the workflow files and repository changes, push to `main`, and monitor the Actions tab.
- Confirm that the frontend workflow produces the `frontend-dist` artefact, then the backend workflow consumes it and deploys successfully.
- Verify the live site (static pages + API endpoints) and ensure Application Insights is receiving request telemetry.
- Update `conversation_history.md` with workflow run URLs, deployment timestamps, and validation evidence.

