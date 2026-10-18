import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { CredentialsController } from '@modules/admin/credentials.controller';
import { type ActiveCatalogCache } from '@modules/catalog/active-catalog.cache';
import { type CredentialProber } from '@modules/credentials/credential-prober';
import { CredentialResolver } from '@modules/credentials/credential-resolver.service';
import { CredentialService } from '@modules/credentials/credential.service';

import { box, FakeCredentialRepository, keyring, ManualTimers, OPENROUTER_SECRET } from '../credentials/credential.fixtures';
import { asPrincipal, caller, expectFailure, FakeReply, NOVEL_FORGE, userWith } from './admin.fixtures';

let restoreLogger: RestoreLogger;
let repository: FakeCredentialRepository;
let controller: CredentialsController;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(() => {
  repository = new FakeCredentialRepository();
  const cache = { current: () => null } as unknown as ActiveCatalogCache;
  const resolver = new CredentialResolver(repository.asRepository(), box(), new ManualTimers());
  const service = new CredentialService(repository.asRepository(), resolver, {} as CredentialProber, cache, box(), keyring());
  controller = new CredentialsController(caller, service);
});

const admin = userWith('credentialsAdmin');

describe('CredentialsController', () => {
  it('should create a credential as the calling admin and answer its metadata only', async () => {
    const created = await asPrincipal(admin, () => controller.createCredential({ name: 'openrouter', allowedOrigin: 'https://openrouter.ai', secret: OPENROUTER_SECRET }));
    expect(created.createdBy).toBe(admin.sub);
    expect(created).not.toHaveProperty('secret');
  });

  it('should answer a refused revocation with 409 and the providers that still name the credential', async () => {
    const created = await asPrincipal(admin, () => controller.createCredential({ name: 'openrouter', allowedOrigin: 'https://openrouter.ai', secret: OPENROUTER_SECRET }));
    repository.published = { providers: { openrouter: { credential: created.id } } };
    const reply = new FakeReply();

    await asPrincipal(admin, () => controller.revokeCredential({ id: created.id }, reply.asResponse()));

    expect({ status: reply.statusCode, body: reply.body }).toEqual({
      status: 409,
      body: { code: AppErrorCode.CRED_IN_USE.code, message: expect.any(String), referencedBy: ['openrouter'] },
    });
  });

  it('should refuse a service principal', async () => {
    await expectFailure(
      asPrincipal(NOVEL_FORGE, () => controller.listCredentials()),
      AuthGuardErrorCode.IAM_002,
    );
  });
});
