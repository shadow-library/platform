import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { type ProviderSpec } from '@modules/catalog/catalog.types';
import { CredentialResolver } from '@modules/credentials/credential-resolver.service';
import { credentialContext } from '@modules/credentials/credential.utils';
import { ProviderCallError } from '@modules/providers/provider-call.error';

import { box, credentialId, FakeCredentialRepository, K2, ManualTimers, OPENROUTER_SECRET } from './credential.fixtures';

const ID = credentialId(1);
const PROVIDER: ProviderSpec = { kind: 'openai', flavor: 'openrouter', url: 'https://openrouter.ai/api/v1', credential: ID, locality: 'third_party', cost: 'metered' };

let restoreLogger: RestoreLogger;
let repository: FakeCredentialRepository;
let resolver: CredentialResolver;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(async () => {
  repository = new FakeCredentialRepository();
  resolver = new CredentialResolver(repository.asRepository(), box(), new ManualTimers());
  await repository.seed(ID, OPENROUTER_SECRET);
});

async function refusal(work: Promise<unknown>): Promise<ProviderCallError> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ProviderCallError)) throw new TypeError(`expected a ProviderCallError, got ${String(error)}`);
  return error;
}

describe('CredentialResolver.resolve with a stored credential', () => {
  it('should decrypt the key once and serve it from memory afterwards', async () => {
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(OPENROUTER_SECRET);
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(OPENROUTER_SECRET);
    expect(repository.findByIdCalls).toBe(1);
  });

  it('should share one decryption among concurrent first uses', async () => {
    const keys = await Promise.all(Array.from({ length: 5 }, () => resolver.resolve(PROVIDER, 'openrouter')));
    expect(keys).toEqual(Array.from({ length: 5 }, () => OPENROUTER_SECRET));
    expect(repository.findByIdCalls).toBe(1);
  });

  it('should refuse a revoked credential as non-retryable without reading it again once the poll has seen it', async () => {
    repository.rows[0]!.revokedAt = new Date();
    await resolver.refresh();
    const error = await refusal(resolver.resolve(PROVIDER, 'openrouter'));
    expect({ code: error.code, retryable: error.retryable }).toEqual({ code: 'revoked_api_key', retryable: false });
    expect(repository.findByIdCalls).toBe(0);
  });

  it('should stop serving a cached key once the poll sees its revocation', async () => {
    await resolver.resolve(PROVIDER, 'openrouter');
    repository.rows[0]!.revokedAt = new Date();
    await resolver.refresh();
    expect((await refusal(resolver.resolve(PROVIDER, 'openrouter'))).code).toBe('revoked_api_key');
  });

  it('should serve the rotated key once the poll sees the new version, evicting the old one', async () => {
    await resolver.refresh();
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(OPENROUTER_SECRET);
    const rotated = `${OPENROUTER_SECRET}-rotated`;
    await repository.rotate(ID, await box().seal(rotated, credentialContext(ID)), 'sk-or-…ated', 'admin-1');
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(OPENROUTER_SECRET);
    await resolver.refresh();
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(rotated);
    expect(repository.findByIdCalls).toBe(2);
  });

  it('should drop a credential this replica changed without waiting for the poll', async () => {
    await resolver.refresh();
    await resolver.resolve(PROVIDER, 'openrouter');
    resolver.forget(ID);
    await resolver.resolve(PROVIDER, 'openrouter');
    expect(repository.findByIdCalls).toBe(2);
  });

  it('should refuse a provider whose URL is not at the origin the credential is bound to', async () => {
    const error = await refusal(resolver.resolve({ ...PROVIDER, url: 'https://collector.example/v1' }, 'openrouter'));
    expect({ code: error.code, retryable: error.retryable }).toEqual({ code: 'credential_origin_mismatch', retryable: false });
    expect(error.message).not.toContain(OPENROUTER_SECRET);
  });

  it('should refuse a credential that does not exist', async () => {
    expect((await refusal(resolver.resolve({ ...PROVIDER, credential: credentialId(9) }, 'openrouter'))).code).toBe('missing_api_key');
  });

  it('should refuse a secret the keyring cannot open, and try again on the next call', async () => {
    const elsewhere = new CredentialResolver(repository.asRepository(), box(K2), new ManualTimers());
    expect((await refusal(elsewhere.resolve(PROVIDER, 'openrouter'))).code).toBe('credential_unreadable');
    await refusal(elsewhere.resolve(PROVIDER, 'openrouter'));
    expect(repository.findByIdCalls).toBe(2);
  });

  it('should keep the states it had when a poll fails', async () => {
    await resolver.refresh();
    await resolver.resolve(PROVIDER, 'openrouter');
    repository.failStatuses = true;
    await resolver.refresh();
    expect(await resolver.resolve(PROVIDER, 'openrouter')).toBe(OPENROUTER_SECRET);
    expect(repository.findByIdCalls).toBe(1);
  });

  it('should send nothing to an ollama provider or one without a credential', async () => {
    expect(await resolver.resolve({ kind: 'ollama', url: 'http://ollama.test:11434', locality: 'host', cost: 'zero' }, 'local')).toBeUndefined();
    expect(await resolver.resolve({ ...PROVIDER, credential: undefined }, 'openrouter')).toBeUndefined();
  });
});

describe('CredentialResolver.resolve with the deprecated apiKeyConfig', () => {
  let restoreConfig: RestoreConfig;
  const LEGACY: ProviderSpec = { ...PROVIDER, credential: undefined, apiKeyConfig: 'synapse.provider.openrouter.api-key' };

  afterAll(() => restoreConfig?.());

  it('should read the key from the env Config key', async () => {
    restoreConfig = setConfig({ 'synapse.provider.openrouter.api-key': 'sk-env' });
    expect(await resolver.resolve(LEGACY, 'openrouter')).toBe('sk-env');
    restoreConfig();
  });

  it('should refuse an unset key by naming the Config key, and a key that is not a credential key', async () => {
    restoreConfig = setConfig({ 'synapse.provider.openrouter.api-key': undefined });
    const missing = await refusal(resolver.resolve(LEGACY, 'openrouter'));
    expect({ code: missing.code, named: missing.message.includes('synapse.provider.openrouter.api-key') }).toEqual({ code: 'missing_api_key', named: true });
    expect((await refusal(resolver.resolve({ ...LEGACY, apiKeyConfig: 'synapse.ledger.retention-days' }, 'openrouter'))).code).toBe('invalid_api_key');
    restoreConfig();
  });
});

describe('CredentialResolver.resolve binding the deprecated apiKeyConfig to its origin', () => {
  it('should refuse to send the env key to any origin but the one the Config key is bound to', async () => {
    const restoreConfig = setConfig({ 'synapse.provider.openrouter.api-key': 'sk-env' });
    const LEGACY: ProviderSpec = { ...PROVIDER, credential: undefined, apiKeyConfig: 'synapse.provider.openrouter.api-key' };
    for (const url of ['https://evil.example/api/v1', 'http://openrouter.ai/api/v1', 'https://openrouter.ai.evil.example/v1']) {
      const error = await refusal(resolver.resolve({ ...LEGACY, url }, 'openrouter'));
      expect({ url, code: error.code, retryable: error.retryable, leaked: error.message.includes('sk-env') }).toEqual({
        url,
        code: 'credential_origin_mismatch',
        retryable: false,
        leaked: false,
      });
    }
    restoreConfig();
  });
});
