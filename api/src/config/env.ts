import type { AppConfig } from '../app';

const parseAllowedOrigins = (raw: string | undefined): string[] | undefined => {
  if (!raw) {
    return undefined;
  }

  const origins = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return origins.length > 0 ? origins : undefined;
};

export const getAppConfig = (): AppConfig => ({
  allowedOrigins: parseAllowedOrigins(process.env.APP_ALLOWED_ORIGINS)
});

export const getPort = (): number => {
  const value = Number.parseInt(process.env.PORT ?? '3000', 10);
  return Number.isNaN(value) ? 3000 : value;
};

export type DatabaseConfig = {
  server?: string;
  database?: string;
  serverSecretName?: string;
  databaseSecretName?: string;
  sqlAuthUser?: string;
  sqlAuthPassword?: string;
};

export const getDatabaseConfig = (): DatabaseConfig => ({
  server: process.env.SQL_SERVER_HOST,
  database: process.env.SQL_DATABASE_NAME,
  serverSecretName: process.env.KEY_VAULT_SQL_SERVER_SECRET,
  databaseSecretName: process.env.KEY_VAULT_SQL_DATABASE_SECRET,
  sqlAuthUser: process.env.SQL_AUTH_USER,
  sqlAuthPassword: process.env.SQL_AUTH_PASSWORD
});

