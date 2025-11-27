# Option A – Direct SQL host & database settings

## App Service configuration (manual secrets, no Key Vault)
```bash
RG_NAME=Upkip-KlingerWestad
WEBAPP_NAME=upklinge-hdb

az webapp config appsettings set \
  --name $WEBAPP_NAME \
  --resource-group $RG_NAME \
  --settings \
    SQL_SERVER_HOST=upklinge-sqlserver.database.windows.net \
    SQL_DATABASE_NAME=HistoricalDB

az webapp config appsettings delete \
  --name $WEBAPP_NAME \
  --resource-group $RG_NAME \
  --setting-names KEY_VAULT_URI KEY_VAULT_SQL_SERVER_SECRET KEY_VAULT_SQL_DATABASE_SECRET
```

## Azure SQL permissions (managed identity)
```sql
CREATE USER [upklinge-hdb] FROM EXTERNAL PROVIDER;
EXEC sp_addrolemember 'db_datareader', 'upklinge-hdb';
```

## Local development (.env)
```dotenv
# api/.env
SQL_SERVER_HOST=upklinge-sqlserver.database.windows.net
SQL_DATABASE_NAME=HistoricalDB
```

Run `az login`, then:
```bash
npm run dev --prefix api
curl "http://localhost:3000/api/customers?name=Hyundai&limit=1"
```

## Verification (live site)
1. `https://upklinge-hdb.azurewebsites.net/api/health`
2. `https://upklinge-hdb.azurewebsites.net/api/customers?name=Hyundai&limit=1`
   - Expect HTTP 200 and <500 ms latency.
   - Record payload samples, timings, and command outputs in `conversation_history.md`.

