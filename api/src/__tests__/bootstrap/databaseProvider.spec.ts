import { DatabaseProvider } from '../../bootstrap/databaseProvider';
import * as env from '../../config/env';

jest.mock('../../config/env');

jest.mock('mssql', () => {
  const queryMock = jest.fn().mockResolvedValue({ recordset: [] });
  const connectMock = jest.fn();

  class FakeRequest {
    input() {
      return this;
    }

    async query() {
      return queryMock();
    }
  }

  class FakePool {
    public connected = false;

    constructor(public readonly config: unknown) {}

    async connect() {
      this.connected = true;
      await connectMock(this.config);
      return this;
    }

    request() {
      return new FakeRequest();
    }

    async close() {
      this.connected = false;
    }
  }

  return {
    ConnectionPool: FakePool,
    __mocks: {
      queryMock,
      connectMock
    }
  };
});

describe('DatabaseProvider', () => {
  const getDatabaseConfig = env.getDatabaseConfig as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses direct environment values when provided', async () => {
    getDatabaseConfig.mockReturnValue({
      server: 'direct-sql-server.database.windows.net',
      database: 'HistoricalDB',
      sqlAuthUser: 'demo-user',
      sqlAuthPassword: 'demo-password'
    });

    const provider = new DatabaseProvider(
      { getAccessToken: async () => 'token' } as never,
      {
        getSecretValue: jest.fn()
      } as never
    );

    const client = await provider.getClient();
    await client.query('SELECT 1', {});

    expect(env.getDatabaseConfig).toHaveBeenCalled();
  });

  it('pulls secrets from Key Vault when named', async () => {
    getDatabaseConfig.mockReturnValue({
      serverSecretName: 'SqlServerHost',
      databaseSecretName: 'SqlDatabaseName'
    });

    const secretProvider = {
      getSecretValue: jest
        .fn()
        .mockResolvedValueOnce('kv-sql-server.database.windows.net')
        .mockResolvedValueOnce('HistoricalDB')
    };

    const provider = new DatabaseProvider(
      { getAccessToken: async () => 'token' } as never,
      secretProvider as never
    );

    const client = await provider.getClient();
    await client.query('SELECT 1', {});

    expect(secretProvider.getSecretValue).toHaveBeenCalledWith('SqlServerHost');
    expect(secretProvider.getSecretValue).toHaveBeenCalledWith('SqlDatabaseName');
  });
});

