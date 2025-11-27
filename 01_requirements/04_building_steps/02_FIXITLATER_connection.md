RG_NAME=Upkip-KlingerWestad
WEBAPP_NAME=upklinge-hdb

az webapp config appsettings set \
  --name $WEBAPP_NAME \
  --resource-group $RG_NAME \
  --settings \
    SQL_SERVER_HOST=upklinge-sqlserver.database.windows.net \
    SQL_DATABASE_NAME=HistoricalDB \
    SQL_AUTH_USER=sqladmin \
    SQL_AUTH_PASSWORD="<your-strong-password>"

    REStART THE WEBAPP

For a local run:
    # api/.env
SQL_SERVER_HOST=upklinge-sqlserver.database.windows.net
SQL_DATABASE_NAME=HistoricalDB
SQL_AUTH_USER=sqladmin
SQL_AUTH