import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError, type ErrorCode } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { type ActiveCatalog, type ProviderSpec } from '@modules/catalog/catalog.types';
import { type CredentialProber, type CredentialTestResult } from '@modules/credentials/credential-prober';
import { CredentialResolver } from '@modules/credentials/credential-resolver.service';
import { CredentialService, probeUrl } from '@modules/credentials/credential.service';
import { credentialContext } from '@modules/credentials/credential.utils';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { box, credentialId, FakeCredentialRepository, K1, K2, keyring, ManualTimers, OPENROUTER_SECRET } from './credential.fixtures';

interface Probe {
  url: string;
  apiKey: string;
}

let restoreLogger: RestoreLogger;
let repository: FakeCredentialRepository;
let active: ActiveCatalog | null;
let probes: Probe[];
let probeResult: CredentialTestResult;
let service: CredentialService;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

function serviceWith(keys: string = K1): CredentialService {
  const cache = { current: () => active } as unknown as ActiveCatalogCache;
  const prober = { probe: async (url: string, apiKey: string) => (probes.push({ url, apiKey }), probeResult) } as unknown as CredentialProber;
  const resolver = new CredentialResolver(repository.asRepository(), box(keys), new ManualTimers());
  return new CredentialService(repository.asRepository(), resolver, prober, cache, box(keys), keyring(keys));
}

beforeEach(() => {
  repository = new FakeCredentialRepository();
  active = null;
  probes = [];
  probeResult = { ok: true };
  service = serviceWith();
});

async function expectFailure(work: Promise<unknown>, code: ErrorCode): Promise<AppError> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!AppError.is(error)) throw new TypeError(`expected an AppError, got ${String(error)}`);
  expect(error.code).toBe(code.code);
  return error;
}

const INPUT = { name: 'openrouter', allowedOrigin: 'HTTPS://OpenRouter.ai:443/', secret: OPENROUTER_SECRET };

describe('CredentialService.create', () => {
  it('should seal the secret under the row id, store the normalised origin and hint, and record the event', async () => {
    const view = await service.create(INPUT, 'admin-1');
    const row = repository.rows[0]!;
    expect({ allowedOrigin: view.allowedOrigin, hint: view.hint, version: view.version, kid: view.kid, createdBy: view.createdBy }).toEqual({
      allowedOrigin: 'https://openrouter.ai',
      hint: 'sk-or-…b2c3',
      version: 1,
      kid: 'k1',
      createdBy: 'admin-1',
    });
    expect((await box().open(row.secret as never, credentialContext(view.id))).toString()).toBe(OPENROUTER_SECRET);
    expect(repository.events).toEqual([{ credentialId: view.id, action: 'create', actor: 'admin-1' }]);
  });

  it('should never return or store the plaintext', async () => {
    const view = await service.create(INPUT, 'admin-1');
    expect(JSON.stringify(view)).not.toContain(OPENROUTER_SECRET.slice(6, -4));
    expect(JSON.stringify(repository.rows)).not.toContain(OPENROUTER_SECRET.slice(6, -4));
  });

  it('should refuse an origin with a path, and a secret no header can carry', async () => {
    await expectFailure(service.create({ ...INPUT, allowedOrigin: 'https://openrouter.ai/api/v1' }, 'admin-1'), AppErrorCode.SYN_INVALID_REQUEST);
    await expectFailure(service.create({ ...INPUT, secret: 'sk-or SECRET with spaces' }, 'admin-1'), AppErrorCode.SYN_INVALID_REQUEST);
    expect(repository.rows).toEqual([]);
  });

  it('should list the providers of the published catalog that name the credential', async () => {
    const view = await service.create(INPUT, 'admin-1');
    active = {
      version: 3,
      document: catalogDocument(document => {
        delete document.providers.openrouter!.apiKeyConfig;
        document.providers.openrouter!.credential = view.id;
      }),
    };
    expect((await service.get(view.id)).referencedBy).toEqual(['openrouter']);
    expect((await service.list()).map(item => item.referencedBy)).toEqual([['openrouter']]);
  });
});

describe('CredentialService.rotate', () => {
  it('should move the version, keep the id and its context, and record the event', async () => {
    const created = await service.create(INPUT, 'admin-1');
    const rotated = await service.rotate(created.id, `${OPENROUTER_SECRET}x9z8`, 'admin-2');
    expect({ id: rotated.id, version: rotated.version, hint: rotated.hint, rotated: rotated.rotatedAt instanceof Date }).toEqual({
      id: created.id,
      version: 2,
      hint: 'sk-or-…x9z8',
      rotated: true,
    });
    expect((await box().open(repository.rows[0]!.secret as never, credentialContext(created.id))).toString()).toBe(`${OPENROUTER_SECRET}x9z8`);
    expect(repository.events.map(event => event.action)).toEqual(['create', 'rotate']);
  });

  it('should refuse to rotate a revoked credential, and answer not found for an unknown one', async () => {
    const created = await service.create(INPUT, 'admin-1');
    await service.revoke(created.id, 'admin-1');
    await expectFailure(service.rotate(created.id, OPENROUTER_SECRET, 'admin-1'), AppErrorCode.CRED_REVOKED);
    await expectFailure(service.rotate(credentialId(9), OPENROUTER_SECRET, 'admin-1'), AppErrorCode.S009);
  });
});

describe('CredentialService.revoke', () => {
  it('should refuse with the referencing providers while the published catalog names the credential', async () => {
    const created = await service.create(INPUT, 'admin-1');
    repository.published = { providers: { openrouter: { credential: created.id }, mirror: { credential: created.id } } };
    const error = await expectFailure(service.revoke(created.id, 'admin-1'), AppErrorCode.CRED_IN_USE);
    expect(error.data?.referencedBy).toEqual(['openrouter', 'mirror']);
    expect(repository.rows[0]!.revokedAt).toBeNull();
  });

  it('should revoke once and answer a repeated revocation unchanged without a second event', async () => {
    const created = await service.create(INPUT, 'admin-1');
    const first = await service.revoke(created.id, 'admin-1');
    const second = await service.revoke(created.id, 'admin-2');
    expect(second.revokedAt).toEqual(first.revokedAt!);
    expect(repository.events.map(event => event.action)).toEqual(['create', 'revoke']);
  });

  it('should answer not found for an unknown credential', async () => {
    await expectFailure(service.revoke(credentialId(9), 'admin-1'), AppErrorCode.S009);
  });
});

describe('CredentialService.test', () => {
  it("should call OpenRouter's key endpoint with the decrypted key and return only the outcome", async () => {
    const created = await service.create(INPUT, 'admin-1');
    probeResult = { ok: false, code: 'unauthorized' };
    expect(await service.test(created.id)).toEqual({ ok: false, code: 'unauthorized' });
    expect(probes).toEqual([{ url: 'https://openrouter.ai/api/v1/key', apiKey: OPENROUTER_SECRET }]);
  });

  it('should answer a revoked or unreadable credential without calling the provider', async () => {
    const created = await service.create(INPUT, 'admin-1');
    expect(await serviceWith(K2).test(created.id)).toEqual({ ok: false, code: 'credential_unreadable' });
    await service.revoke(created.id, 'admin-1');
    expect(await service.test(created.id)).toEqual({ ok: false, code: 'revoked_api_key' });
    expect(probes).toEqual([]);
  });
});

describe('probeUrl', () => {
  const provider = (url: string): ProviderSpec => ({ kind: 'openai', flavor: 'openai-compatible', url, locality: 'third_party', cost: 'metered' });

  it("should use a referencing provider's models endpoint when it shares the origin", () => {
    expect(probeUrl('https://llm.test', [provider('https://llm.test/v1/')])).toBe('https://llm.test/v1/models');
  });

  it('should never follow a provider to another origin, falling back to the OpenAI-compatible default', () => {
    expect(probeUrl('https://llm.test', [provider('https://collector.example/v1')])).toBe('https://llm.test/v1/models');
  });
});

describe('CredentialService.keyringStatus', () => {
  it('should count the credentials per key and flag one missing from the keyring', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET, {}, box(`${K2},${K1}`));
    await repository.seed(credentialId(2), OPENROUTER_SECRET);
    await repository.seed(credentialId(3), OPENROUTER_SECRET);
    expect(await service.keyringStatus()).toEqual({
      activeKeyId: 'k1',
      keys: [
        { kid: 'k2', credentials: 1, inKeyring: false },
        { kid: 'k1', credentials: 2, inKeyring: true },
      ],
    });
  });

  it('should list the active key even before any credential uses it', async () => {
    expect(await service.keyringStatus()).toEqual({ activeKeyId: 'k1', keys: [{ kid: 'k1', credentials: 0, inKeyring: true }] });
  });
});
