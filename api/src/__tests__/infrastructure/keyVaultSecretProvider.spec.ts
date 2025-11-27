import { KeyVaultSecretProvider } from '../../infrastructure/keyVaultSecretProvider';

class FakeSecretClient {
  private readonly values: Map<string, string>;
  public callCount = 0;

  constructor(initial: Record<string, string>) {
    this.values = new Map(Object.entries(initial));
  }

  async getSecret(name: string) {
    this.callCount += 1;
    const value = this.values.get(name);
    if (!value) {
      throw new Error(`Secret ${name} missing`);
    }
    return { value };
  }
}

describe('KeyVaultSecretProvider', () => {
  it('returns cached secret until TTL expires', async () => {
    const client = new FakeSecretClient({ sqlConn: 'ServerValue' });
    const provider = new KeyVaultSecretProvider({
      client: client as unknown as { getSecret: (name: string) => Promise<{ value?: string }> },
      cacheTtlMs: 10_000
    });

    const first = await provider.getSecretValue('sqlConn');
    const second = await provider.getSecretValue('sqlConn');

    expect(first).toBe('ServerValue');
    expect(second).toBe('ServerValue');
    expect(client.callCount).toBe(1);
  });

  it('refreshes secret after TTL', async () => {
    const client = new FakeSecretClient({ sqlConn: 'ServerValue' });
    const provider = new KeyVaultSecretProvider({
      client: client as unknown as { getSecret: (name: string) => Promise<{ value?: string }> },
      cacheTtlMs: 1
    });

    const first = await provider.getSecretValue('sqlConn');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await provider.getSecretValue('sqlConn');

    expect(first).toBe('ServerValue');
    expect(second).toBe('ServerValue');
    expect(client.callCount).toBeGreaterThanOrEqual(2);
  });
});

