import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { CryptoErrorCode, type Envelope, parseKeyring } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { IdentityKeyringService } from '@server/modules/auth/keys/identity-keyring.service';
import { KEYRING_CHECK_RETRY_MS, SEALED_COLUMNS } from '@server/modules/auth/keys/sealed-secret.constants';

import { FakeSealedSecretStore, K1, K2, LEGACY_MFA_SECRET, ROTATED, sealerFor, WEBHOOK_CURRENT_SECRET } from './keys.fixtures';

interface ManualDelay {
  delays: number[];
  release(): void;
  delay(ms: number): Promise<void>;
}

let restoreLogger: RestoreLogger;
let store: FakeSealedSecretStore;
let manual: ManualDelay;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(() => {
  store = new FakeSealedSecretStore();
  const waiting: (() => void)[] = [];
  manual = {
    delays: [],
    release: () => waiting.shift()?.(),
    delay(ms) {
      this.delays.push(ms);
      return new Promise(resolve => waiting.push(resolve));
    },
  };
});

function serviceWith(keys: string): IdentityKeyringService {
  return new IdentityKeyringService(store, parseKeyring(keys), sealerFor(keys), ms => manual.delay(ms));
}

async function seal(keys: string, id: string, secret = WEBHOOK_CURRENT_SECRET): Promise<Envelope> {
  return sealerFor(keys).seal(secret, SEALED_COLUMNS.webhookSecret, id);
}

describe('IdentityKeyringService.onModuleInit', () => {
  it('should let the replica become ready when the keyring holds every key in use', async () => {
    store.add(SEALED_COLUMNS.webhookSecret, '1', null, await seal(K1, '1'));
    store.add(SEALED_COLUMNS.mfaSecret, '2', LEGACY_MFA_SECRET);

    await serviceWith(ROTATED).onModuleInit();
  });

  it('should refuse to become ready while a key in use is missing from the keyring', async () => {
    store.add(SEALED_COLUMNS.webhookSecret, '1', null, await seal(ROTATED, '1'));

    const error = await serviceWith(K1)
      .onModuleInit()
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(AppError.is(error, CryptoErrorCode.UNKNOWN_KEY)).toBe(true);
  });

  it('should wait out a database it cannot reach rather than become ready unchecked', async () => {
    store.failKidCounts = 1;
    let ready = false;
    const init = serviceWith(K1)
      .onModuleInit()
      .then(() => (ready = true));
    await Bun.sleep(0);

    expect({ ready, delays: manual.delays }).toEqual({ ready: false, delays: [KEYRING_CHECK_RETRY_MS] });
    manual.release();
    await init;
    expect(ready).toBe(true);
  });
});

describe('IdentityKeyringService.maintain', () => {
  it('should seal the rows an old image left legacy-only and move every row onto the active key', async () => {
    const stale = store.add(SEALED_COLUMNS.webhookSecret, '1', null, await seal(K1, '1'));
    const legacyOnly = store.add(SEALED_COLUMNS.mfaSecret, '2', LEGACY_MFA_SECRET);
    const before = stale.envelope as Envelope;

    await serviceWith(ROTATED).maintain();

    const after = stale.envelope as Envelope;
    expect({ kids: [after.kid, (legacyOnly.envelope as Envelope).kid], ct: after.ct }).toEqual({ kids: ['k2', 'k2'], ct: before.ct });
    expect((await sealerFor(K2).open({ envelope: after, legacy: null }, SEALED_COLUMNS.webhookSecret, '1')).toString()).toBe(WEBHOOK_CURRENT_SECRET);
  });

  it('should carry on past a row it cannot rewrap, and keep a row replaced meanwhile', async () => {
    const broken = store.add(SEALED_COLUMNS.webhookSecret, '1', null, { not: 'an envelope' });
    const replaced = store.add(SEALED_COLUMNS.webhookSecret, '2', null, await seal(K1, '2'));
    const healthy = store.add(SEALED_COLUMNS.webhookSecret, '3', null, await seal(K1, '3'));
    const newer = await seal(ROTATED, '2', 'whsec_rotated-meanwhile');
    store.beforeWrite = row => {
      if (row === replaced) row.envelope = newer;
    };

    await serviceWith(ROTATED).maintain();

    expect([broken.envelope, replaced.envelope, (healthy.envelope as Envelope).kid]).toEqual([{ not: 'an envelope' }, newer, 'k2']);
  });

  it('should leave the rows alone while another replica holds the lock', async () => {
    const row = store.add(SEALED_COLUMNS.webhookSecret, '1', null, await seal(K1, '1'));
    store.rewrapLocked = true;

    await serviceWith(ROTATED).maintain();

    expect((row.envelope as Envelope).kid).toBe('k1');
  });
});
