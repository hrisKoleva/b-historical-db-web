import { ConnectionPool, config as SqlConfig } from 'mssql';

export type SqlClientOptions = {
  server: string;
  database: string;
  tokenProvider: () => Promise<string>;
  encrypt?: boolean;
  user?: string;
  password?: string;
};

export class SqlClient {
  private pool?: ConnectionPool;
  private connecting?: Promise<ConnectionPool>;

  constructor(private readonly options: SqlClientOptions) {}

  async query<T>(statement: string, parameters: Record<string, unknown>): Promise<T[]> {
    return this.executeWithRetry<T>(statement, parameters, true);
  }

  async dispose(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  private async executeWithRetry<T>(
    statement: string,
    parameters: Record<string, unknown>,
    allowRetry: boolean
  ): Promise<T[]> {
    try {
      const pool = await this.getPool();
      const request = pool.request();
      for (const [name, value] of Object.entries(parameters)) {
        request.input(name, value);
      }
      const result = await request.query<T>(statement);
      return result.recordset ?? [];
    } catch (error) {
      if (allowRetry && !this.usingSqlAuth() && this.isTokenRelatedError(error)) {
        await this.resetPool();
        return this.executeWithRetry(statement, parameters, false);
      }
      throw error;
    }
  }

  private async getPool(): Promise<ConnectionPool> {
    if (this.pool?.connected) {
      return this.pool;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.createPool();
    try {
      this.pool = await this.connecting;
      return this.pool;
    } finally {
      this.connecting = undefined;
    }
  }

  private async createPool(): Promise<ConnectionPool> {
    const commonConfig: Pick<SqlConfig, 'server' | 'database' | 'options'> = {
      server: this.options.server,
      database: this.options.database,
      options: {
        encrypt: this.options.encrypt ?? true,
        trustServerCertificate: false
      }
    };

    let config: SqlConfig;

    if (this.usingSqlAuth()) {
      config = {
        ...commonConfig,
        user: this.options.user,
        password: this.options.password
      } as SqlConfig;
    } else {
      const token = await this.options.tokenProvider();
      config = {
        ...commonConfig,
        authentication: {
          type: 'azure-active-directory-access-token',
          options: {
            token
          }
        }
      } as SqlConfig;
    }

    const pool = new ConnectionPool(config);
    await pool.connect();
    return pool;
  }

  private async resetPool() {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  private usingSqlAuth(): boolean {
    return Boolean(this.options.user && this.options.password);
  }

  private isTokenRelatedError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const message = 'message' in error ? String((error as { message?: string }).message) : '';
    return message.toLowerCase().includes('token') && message.toLowerCase().includes('expire');
  }
}

