import { DefaultAzureCredential, TokenCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

type SecretClientLike = {
  getSecret: (name: string) => Promise<{ value?: string | undefined }>;
};

type KeyVaultSecretProviderOptions = {
  vaultUrl?: string;
  credential?: TokenCredential;
  client?: SecretClientLike;
  cacheTtlMs?: number;
};

type CachedSecret = {
  value: string;
  expiresAt: number;
};

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class KeyVaultSecretProvider {
  private readonly client: SecretClientLike;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CachedSecret>();

  constructor(options: KeyVaultSecretProviderOptions = {}) {
    const credential = options.credential ?? new DefaultAzureCredential();
    const vaultUrl = options.vaultUrl ?? process.env.KEY_VAULT_URI;

    if (!options.client && !vaultUrl) {
      throw new Error('KeyVault URI is required when a client instance is not provided.');
    }

    this.client =
      options.client ??
      (new SecretClient(vaultUrl as string, credential) as SecretClientLike);
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getSecretValue(secretName: string): Promise<string> {
    const cached = this.cache.get(secretName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const secret = await this.client.getSecret(secretName);
    if (!secret?.value) {
      throw new Error(`Secret ${secretName} returned no value.`);
    }

    this.cache.set(secretName, {
      value: secret.value,
      expiresAt: Date.now() + this.cacheTtlMs
    });

    return secret.value;
  }

  clear(secretName?: string) {
    if (secretName) {
      this.cache.delete(secretName);
      return;
    }
    this.cache.clear();
  }
}

