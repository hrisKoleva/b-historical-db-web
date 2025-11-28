# Step 6.1 – Configure Azure SQL Connectivity

## Option A – Direct environment variables
1. Set `SQL_SERVER_HOST` (e.g. `upklinge-sqlserver.database.windows.net`) and `SQL_DATABASE_NAME` (`HistoricalDB`) in your environment:
   ```powershell
   # Local PowerShell (on D: or Cloud Shell bash)
   $env:SQL_SERVER_HOST = "upklinge-sqlserver.database.windows.net"
   $env:SQL_DATABASE_NAME = "HistoricalDB"
   ```
2. Add the same values under App Service → Configuration → Application settings (`SQL_SERVER_HOST`, `SQL_DATABASE_NAME`).
3. Local API test:
   ```bash
   npm run dev --prefix api
   curl "http://localhost:3000/api/customers?name=Hyundai"
   ```

## Option B – Key Vault secrets (recommended)
1. Store host/database names in Key Vault:
**IMPORTANT**
KV_NAME=kv-hdb-prod          # or your chosen name
RG_NAME=Upkip-KlingerWestad
LOCATION=westeurope

az keyvault create \
  --name "$KV_NAME" \
  --resource-group "$RG_NAME" \
  --location "$LOCATION" \
  --enable-purge-protection true
  **IMPORTANT**

Run these in Cloud Shell:
az keyvault secret set \
  --vault-name kv-hdb-prod \
  --name SqlServerHost \
  --value upklinge-sqlserver.database.windows.net

az keyvault secret set \
  --vault-name kv-hdb-prod \
  --name SqlDatabaseName \
  --value HistoricalDB

Option 1 – Portal
Azure Portal → Key Vaults → kv-hdb-prod.
In the left menu, open Access control (IAM).
Click Add role assignment.
Role: Key Vault Administrator (or at minimum Key Vault Secrets Officer).
Assign access to: User → select your Azure account.
Save. Wait a few seconds (sometimes up to a minute).
Option 2 – CLI (if you have Owner perms)
SCOPE=$(az keyvault show --name kv-hdb-prod --resource-group Upkip-KlingerWestad --query id -o tsv)USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)az role assignment create \  --assignee-object-id "$USER_OBJECT_ID" \  --role "Key Vault Administrator" \  --scope "$SCOPE"
After granting yourself access, rerun:
az keyvault secret set --vault-name kv-hdb-prod --name SqlServerHost --value upklinge-sqlserver.database.windows.netaz keyvault secret set --vault-name kv-hdb-prod --name SqlDatabaseName --value HistoricalDB
Let me know if assigning the role works or if you get a different error message.

   ```bash
   az keyvault secret set --vault-name kv-hdb-prod --name SqlServerHost --value upklinge-sqlserver.database.windows.net
   az keyvault secret set --vault-name kv-hdb-prod --name SqlDatabaseName --value HistoricalDB
   ```
2. App settings (App Service → Configuration):
   ```
   KEY_VAULT_URI = https://kv-hdb-prod.vault.azure.net/
   KEY_VAULT_SQL_SERVER_SECRET = SqlServerHost
   KEY_VAULT_SQL_DATABASE_SECRET = SqlDatabaseName
   ```
3. Ensure the App Service managed identity has Key Vault secret `get/list` permission.

## Azure SQL permissions
```sql
-- Connect as Azure AD admin
CREATE USER [upklinge-hdb] FROM EXTERNAL PROVIDER;
EXEC sp_addrolemember 'db_datareader', 'upklinge-hdb';
```

## Verification
1. `GET https://upklinge-hdb.azurewebsites.net/api/health`
2. `GET https://upklinge-hdb.azurewebsites.net/api/customers?name=Hyundai`
   - Expect HTTP 200, response <500 ms.
   - Log sample payloads and latency in `conversation_history.md`.



