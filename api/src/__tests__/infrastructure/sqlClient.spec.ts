import { SqlClient } from '../../infrastructure/sqlClient';

jest.mock('mssql', () => {
  const connectMock = jest.fn();
  const closeMock = jest.fn();
  const inputMock = jest.fn();
  const queryMock = jest.fn();

  class FakeRequest {
    input(name: string, value: unknown) {
      inputMock(name, value);
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
      connectMock(this.config);
      return this;
    }

    request() {
      return new FakeRequest();
    }

    async close() {
      this.connected = false;
      await closeMock();
    }
  }

  return {
    ConnectionPool: FakePool,
    __mocks: {
      connectMock,
      closeMock,
      inputMock,
      queryMock
    }
  };
});

const {
  __mocks: mssqlMocks
} = jest.requireMock('mssql') as {
  __mocks: {
    connectMock: jest.Mock;
    closeMock: jest.Mock;
    inputMock: jest.Mock;
    queryMock: jest.Mock;
  };
};

describe('SqlClient', () => {
  beforeEach(() => {
    mssqlMocks.connectMock.mockReset();
    mssqlMocks.closeMock.mockReset();
    mssqlMocks.inputMock.mockReset();
    mssqlMocks.queryMock.mockReset();
  });

  it('executes parameterised query', async () => {
    mssqlMocks.queryMock.mockResolvedValue({ recordset: [{ id: 1 }] });
    const client = new SqlClient({
      server: 'sql-server',
      database: 'HistoricalDB',
      tokenProvider: async () => 'token'
    });

    const rows = await client.query<{ id: number }>('SELECT @id', { id: 42 });

    expect(rows).toEqual([{ id: 1 }]);
    expect(mssqlMocks.connectMock).toHaveBeenCalledTimes(1);
    expect(mssqlMocks.inputMock).toHaveBeenCalledWith('id', 42);
  });

  it('disposes pool when requested', async () => {
    const client = new SqlClient({
      server: 'sql-server',
      database: 'HistoricalDB',
      tokenProvider: async () => 'token'
    });

    mssqlMocks.queryMock.mockResolvedValue({ recordset: [] });
    await client.query('SELECT 1', {});

    await client.dispose();

    expect(mssqlMocks.closeMock).toHaveBeenCalled();
  });
});

