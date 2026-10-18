import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { CryptoErrorCode, type Envelope } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { CredentialKeyringService, KEYRING_CHECK_RETRY_MS } from '@modules/credentials/credential-keyring.service';
import { credentialContext } from '@modules/credentials/credential.utils';

import { box, credentialId, FakeCredentialRepository, K1, K2, keyring, ManualTimers, OPENROUTER_SECRET } from './credential.fixtures';

const ROTATED = `${K2},${K1}`;

let restoreLogger: RestoreLogger;
let repository: FakeCredentialRepository;
let timers: ManualTimers;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(() => {
  repository = new FakeCredentialRepository();
  timers = new ManualTimers();
});

function serviceWith(keys: string): CredentialKeyringService {
  return new CredentialKeyringService(repository.asRepository(), keyring(keys), box(keys), timers);
}

function envelopeOf(index: number): Envelope {
  return repository.rows[index]!.secret as Envelope;
}

describe('CredentialKeyringService.onModuleInit', () => {
  it('should let the replica become ready when the keyring holds every key in use', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET);
    await serviceWith(ROTATED).onModuleInit();
  });

  it('should refuse to become ready while a key in use is missing from the keyring', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET, {}, box(ROTATED));
    const error = await serviceWith(K1)
      .onModuleInit()
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(AppError.is(error, CryptoErrorCode.UNKNOWN_KEY)).toBe(true);
  });

  it('should wait out a database it cannot reach rather than become ready unchecked', async () => {
    repository.failKidCounts = 1;
    let ready = false;
    const init = serviceWith(K1)
      .onModuleInit()
      .then(() => (ready = true));
    await Bun.sleep(0);
    expect({ ready, delays: timers.delays.map(delay => delay.delayMs) }).toEqual({ ready: false, delays: [KEYRING_CHECK_RETRY_MS] });
    timers.delays[0]!.fire();
    await init;
    expect(ready).toBe(true);
  });
});

describe('CredentialKeyringService.rewrap', () => {
  it('should move every row onto the active key, re-wrapping only the data key', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET);
    await repository.seed(credentialId(2), `${OPENROUTER_SECRET}-2`);
    const before = envelopeOf(0);
    await serviceWith(ROTATED).rewrap();
    expect(repository.rows.map(row => (row.secret as Envelope).kid)).toEqual(['k2', 'k2']);
    expect({ ct: envelopeOf(0).ct, iv: envelopeOf(0).iv, tag: envelopeOf(0).tag }).toEqual({ ct: before.ct, iv: before.iv, tag: before.tag });
    expect((await box(ROTATED).open(envelopeOf(1), credentialContext(credentialId(2)))).toString()).toBe(`${OPENROUTER_SECRET}-2`);
  });

  it('should leave a row a rotation changed meanwhile, and carry on past a row it cannot read', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET);
    await repository.seed(credentialId(2), OPENROUTER_SECRET, { secret: { not: 'an envelope' } });
    await repository.seed(credentialId(3), OPENROUTER_SECRET);
    repository.beforeRewrapWrite = candidate => {
      if (candidate.id === credentialId(1)) repository.rows[0]!.version++;
    };
    await serviceWith(ROTATED).rewrap();
    expect(repository.rows.map(row => (row.secret as Partial<Envelope>).kid ?? null)).toEqual(['k1', null, 'k2']);
  });

  it('should leave the rows alone while another replica holds the lock', async () => {
    await repository.seed(credentialId(1), OPENROUTER_SECRET);
    repository.rewrapLocked = true;
    await serviceWith(ROTATED).rewrap();
    expect(envelopeOf(0).kid).toBe('k1');
  });
});
