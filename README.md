# KLINGER Westad Historical Database Web App

This repository hosts the Azure web application that surfaces historical business data. The solution is split into two workspaces:

- `api/` – Node.js + TypeScript backend providing secure REST APIs backed by Azure SQL (managed identity).
- `web/` – React + TypeScript frontend delivered with Vite, consuming the backend APIs and applying the KLINGER Westad branding.

## Getting Started

1. Install dependencies for both workspaces:
   ```bash
   npm run install:all
   ```
2. Run the backend in development mode:
   ```bash
   npm run dev --prefix api
   ```
3. In a separate terminal, start the frontend:
   ```bash
   npm run dev --prefix web
   ```

Refer to `04_building_steps/01_building_steps.md` for the full build and deployment playbook.

## Continuous delivery

GitHub Actions pipelines live under `.github/workflows/`:

- `frontend.yml` runs lint/tests/build for the React app on every push/PR to `main` and retains the `frontend-dist` artefact.
- `backend.yml` (triggered on push to `main` or manually) lints/tests/builds the API, rebuilds the SPA, packages everything, and deploys to Azure via publish profile.

Expose the App Service publish profile as the repository secret `AZURE_WEBAPP_PUBLISH_PROFILE` before enabling the backend workflow.

