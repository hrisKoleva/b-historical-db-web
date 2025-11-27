import { TokenCredential, AccessToken } from '@azure/identity';
import { AzureSqlTokenProvider } from '../../infrastructure/azureSqlTokenProvider';

class StubCredential implements TokenCredential {
  private tokens: AccessToken[];

  constructor(tokens: AccessToken[]) {
    this.tokens = [...tokens];
  }

  async getToken(): Promise<AccessToken> {
    const next = this.tokens.shift();
    if (!next) {
      throw new Error('No more tokens available');
    }
    return next;
  }
}

describe('AzureSqlTokenProvider', () => {
  it('returns cached token while still valid', async () => {
    const expires = Date.now() + 5 * 60 * 1000;
    const credential = new StubCredential([
      { token: 'first', expiresOnTimestamp: expires }
    ]);
    const provider = new AzureSqlTokenProvider({ credential });

    const token1 = await provider.getAccessToken();
    const token2 = await provider.getAccessToken();

    expect(token1).toBe('first');
    expect(token2).toBe('first');
  });

  it('refreshes token when about to expire', async () => {
    const now = Date.now();
    const credential = new StubCredential([
      { token: 'expiring', expiresOnTimestamp: now + 30 * 1000 },
      { token: 'refreshed', expiresOnTimestamp: now + 5 * 60 * 1000 }
    ]);
    const provider = new AzureSqlTokenProvider({
      credential,
      refreshBufferMs: 60 * 1000
    });

    const token1 = await provider.getAccessToken();
    const token2 = await provider.getAccessToken();

    expect(token1).toBe('expiring');
    expect(token2).toBe('refreshed');
  });
});

