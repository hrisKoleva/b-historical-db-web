import { DefaultAzureCredential, TokenCredential } from '@azure/identity';

type AzureSqlTokenProviderOptions = {
  credential?: TokenCredential;
  scope?: string;
  refreshBufferMs?: number;
};

type CachedToken = {
  value: string;
  expiresOn: number;
};

const DEFAULT_SCOPE = 'https://database.windows.net/.default';
const DEFAULT_REFRESH_BUFFER_MS = 2 * 60 * 1000; // 2 minutes

export class AzureSqlTokenProvider {
  private readonly credential: TokenCredential;
  private readonly scope: string;
  private readonly refreshBufferMs: number;
  private cachedToken?: CachedToken;

  constructor(options: AzureSqlTokenProviderOptions = {}) {
    this.credential = options.credential ?? new DefaultAzureCredential();
    this.scope = options.scope ?? DEFAULT_SCOPE;
    this.refreshBufferMs = options.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS;
  }

  async getAccessToken(): Promise<string> {
    if (!this.needsRefresh(this.cachedToken)) {
      return this.cachedToken!.value;
    }

    const token = await this.credential.getToken(this.scope);

    if (!token?.token || !token.expiresOnTimestamp) {
      throw new Error('Failed to acquire Azure SQL access token.');
    }

    this.cachedToken = {
      value: token.token,
      expiresOn: token.expiresOnTimestamp
    };

    return this.cachedToken.value;
  }

  private needsRefresh(cache?: CachedToken): boolean {
    if (!cache) {
      return true;
    }

    const now = Date.now();
    return cache.expiresOn - this.refreshBufferMs <= now;
  }
}

