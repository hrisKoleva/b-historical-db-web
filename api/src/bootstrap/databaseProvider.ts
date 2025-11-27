import { AzureSqlTokenProvider } from '../infrastructure/azureSqlTokenProvider';
import { KeyVaultSecretProvider } from '../infrastructure/keyVaultSecretProvider';
import { SqlClient } from '../infrastructure/sqlClient';
import { getDatabaseConfig } from '../config/env';

type ConnectionInfo = {
  server: string;
  database: string;
  user?: string;
  password?: string;
};

export class DatabaseProvider {
  private readonly tokenProvider: AzureSqlTokenProvider;
  private secretProvider?: KeyVaultSecretProvider;
  private readonly config = getDatabaseConfig();
  private client?: SqlClient;
  private connectionInfo?: ConnectionInfo;

  constructor(
    tokenProvider = new AzureSqlTokenProvider(),
    secretProvider?: KeyVaultSecretProvider
  ) {
    this.tokenProvider = tokenProvider;
    this.secretProvider = secretProvider;
  }

  async getClient(): Promise<SqlClient> {
    if (!this.client) {
      const info = await this.resolveConnectionInfo();
      this.client = new SqlClient({
        server: info.server,
        database: info.database,
        user: info.user,
        password: info.password,
        tokenProvider: () => this.tokenProvider.getAccessToken()
      });
    }
    return this.client;
  }

  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.dispose();
      this.client = undefined;
    }
  }

  private async resolveConnectionInfo(): Promise<ConnectionInfo> {
    if (this.connectionInfo) {
      return this.connectionInfo;
    }

    if (this.config.server && this.config.database) {
      this.connectionInfo = {
        server: this.config.server,
        database: this.config.database,
        user: this.config.sqlAuthUser,
        password: this.config.sqlAuthPassword
      };
      return this.connectionInfo;
    }

    if (this.config.serverSecretName && this.config.databaseSecretName) {
      const provider = this.ensureSecretProvider();
      const [server, database] = await Promise.all([
        provider.getSecretValue(this.config.serverSecretName),
        provider.getSecretValue(this.config.databaseSecretName)
      ]);
      this.connectionInfo = {
        server,
        database,
        user: this.config.sqlAuthUser,
        password: this.config.sqlAuthPassword
      };
      return this.connectionInfo;
    }

    throw new Error(
      'SQL connection configuration is incomplete. Provide direct values or Key Vault secret names.'
    );
  }

  private ensureSecretProvider(): KeyVaultSecretProvider {
    if (!this.secretProvider) {
      this.secretProvider = new KeyVaultSecretProvider();
    }
    return this.secretProvider;
  }
}

