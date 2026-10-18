import { Inject, Injectable, type OnApplicationReady, type OnApplicationStop, type OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { isEnvelope, type SecretBox } from '@shadow-library/common/crypto';

import { APP_NAME, PROVIDER_CREDENTIAL_KEYS, PROVIDER_CREDENTIAL_ORIGINS } from '@server/constants';
import { type Credential } from '@server/database';

import { type CatalogTimers } from '@modules/catalog/active-catalog.cache';
import { urlOrigin } from '@modules/catalog/catalog-credentials';
import { type ProviderSpec } from '@modules/catalog/catalog.types';
import { ProviderCallError, type ProviderFailureCode } from '@modules/providers/provider-call.error';

import { CREDENTIAL_BOX, CREDENTIAL_TIMERS } from './credential.constants';
import { CredentialRepository } from './credential.repository';
import { credentialContext } from './credential.utils';

interface KnownState {
  version: number;
  revoked: boolean;
}

interface OpenedSecret {
  apiKey: string;
  allowedOrigin: string;
  version: number;
}

function refused(code: ProviderFailureCode, message: string): ProviderCallError {
  return new ProviderCallError({ retryable: false, code, message });
}

function secretKey(id: string, version: number): string {
  return `${id}:${version}`;
}

function isCredentialKey(key: string): key is (typeof PROVIDER_CREDENTIAL_KEYS)[number] {
  return (PROVIDER_CREDENTIAL_KEYS as readonly string[]).includes(key);
}

/** The deprecated path, kept for one release: a provider still naming a Config key, which holds the same key a stored credential may */
function fromConfig(provider: ProviderSpec, providerKey: string, configKey: string): string {
  if (!isCredentialKey(configKey)) throw refused('invalid_api_key', `Provider '${providerKey}' names '${configKey}', which is not a credential key`);
  if (urlOrigin(provider.url) !== PROVIDER_CREDENTIAL_ORIGINS[configKey]) {
    throw refused('credential_origin_mismatch', `Provider '${providerKey}' is not at the origin '${configKey}' is bound to`);
  }
  const apiKey = Config.get(configKey);
  if (!apiKey) throw refused('missing_api_key', `Provider '${providerKey}' has no API key: '${configKey}' is not set`);
  return apiKey;
}

/**
 * Turns a provider's credential into its API key. A secret is decrypted on first use and kept in this replica's memory under `id:version`;
 * the poll reads every credential's version and revocation, so a rotation or a revocation on any replica reaches this one within one interval,
 * and the evicted plaintext is never served again. Concurrent first uses of one credential share a single decryption.
 */
@Injectable()
export class CredentialResolver implements OnModuleInit, OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, CredentialResolver.name);
  private states = new Map<string, KnownState>();
  private readonly secrets = new Map<string, OpenedSecret>();
  private readonly loading = new Map<string, Promise<OpenedSecret>>();
  private refreshing: Promise<void> | null = null;
  private stopPolling: (() => void) | null = null;

  constructor(
    private readonly repository: CredentialRepository,
    @Inject(CREDENTIAL_BOX) private readonly box: SecretBox,
    @Inject(CREDENTIAL_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  onApplicationReady(): void {
    this.stopPolling = this.timers.every(Config.get('synapse.catalog.poll-ms'), () => void this.refresh());
  }

  onApplicationStop(): void {
    this.stopPolling?.();
    this.stopPolling = null;
  }

  /** `undefined` sends no authorization; a credential that cannot be used is refused, never retried on another deployment. */
  async resolve(provider: ProviderSpec, providerKey: string): Promise<string | undefined> {
    if (provider.kind === 'ollama') return undefined;
    if (provider.credential) return this.fromCredential(provider, providerKey, provider.credential);
    if (provider.apiKeyConfig) return fromConfig(provider, providerKey, provider.apiKeyConfig);
    return undefined;
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.reload().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** The replica that rotated or revoked a credential drops it at once rather than at the next poll. */
  forget(id: string): void {
    this.states.delete(id);
    for (const key of this.secrets.keys()) if (key.startsWith(`${id}:`)) this.secrets.delete(key);
  }

  private async fromCredential(provider: ProviderSpec, providerKey: string, id: string): Promise<string> {
    if (this.states.get(id)?.revoked) throw this.revoked(providerKey, id);
    const secret = await this.load(id);
    if (urlOrigin(provider.url) !== secret.allowedOrigin) {
      this.logger.warn('Refused a credential for a provider outside its origin', { provider: providerKey, credential: id });
      throw refused('credential_origin_mismatch', `Provider '${providerKey}' is not at the origin its credential is bound to`);
    }
    return secret.apiKey;
  }

  private load(id: string): Promise<OpenedSecret> {
    const known = this.states.get(id);
    const cached = known && this.secrets.get(secretKey(id, known.version));
    if (cached) return Promise.resolve(cached);

    const flightKey = known ? secretKey(id, known.version) : id;
    const inFlight = this.loading.get(flightKey);
    if (inFlight) return inFlight;
    const loading = this.open(id).finally(() => this.loading.delete(flightKey));
    this.loading.set(flightKey, loading);
    return loading;
  }

  private async open(id: string): Promise<OpenedSecret> {
    const row = await this.repository.findById(id);
    if (!row) throw refused('missing_api_key', 'The provider names a credential that does not exist');
    this.note(row);
    if (row.revokedAt) throw this.revoked(undefined, id);
    if (!isEnvelope(row.secret)) throw this.unreadable(id, 'not_an_envelope');

    let plaintext: Buffer;
    try {
      plaintext = await this.box.open(row.secret, credentialContext(id));
    } catch (error) {
      throw this.unreadable(id, AppError.is(error) ? error.code : 'unknown');
    }
    const secret = { apiKey: plaintext.toString('utf8'), allowedOrigin: row.allowedOrigin, version: row.version };
    plaintext.fill(0);
    if (this.states.get(id)?.version === row.version) this.secrets.set(secretKey(id, row.version), secret);
    return secret;
  }

  private note(row: Credential.Row): void {
    const known = this.states.get(row.id);
    if (known && known.version > row.version) return;
    this.states.set(row.id, { version: row.version, revoked: row.revokedAt !== null });
  }

  private async reload(): Promise<void> {
    try {
      const statuses = await this.repository.statuses();
      this.states = new Map(statuses.map(status => [status.id, { version: status.version, revoked: status.revokedAt !== null }]));
      for (const [key, secret] of this.secrets) {
        const state = this.states.get(key.slice(0, key.lastIndexOf(':')));
        if (!state || state.revoked || state.version !== secret.version) this.secrets.delete(key);
      }
    } catch (error) {
      this.logger.error('Failed to refresh the provider credentials', { error });
    }
  }

  private revoked(providerKey: string | undefined, id: string): ProviderCallError {
    this.logger.warn('Refused a revoked provider credential', { provider: providerKey, credential: id });
    return refused('revoked_api_key', providerKey ? `Provider '${providerKey}' uses a revoked credential` : 'The provider uses a revoked credential');
  }

  private unreadable(id: string, reason: string): ProviderCallError {
    this.logger.error('Could not decrypt a provider credential', { credential: id, reason });
    return refused('credential_unreadable', 'The provider credential could not be read');
  }
}
