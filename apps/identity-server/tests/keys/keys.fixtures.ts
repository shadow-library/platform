import { AppError } from '@shadow-library/common';
import { type Envelope, parseKeyring, SecretBox } from '@shadow-library/common/crypto';

import { LegacyKeyProvider, type LegacySecret } from '@server/modules/auth/keys/legacy-key-provider';
import { type SealedColumn } from '@server/modules/auth/keys/sealed-secret.constants';
import {
  type BackfillBatch,
  type KidCount,
  type RewrapResult,
  type RewrapSealed,
  type SealedSecretStore,
  type SealLegacy,
} from '@server/modules/auth/keys/sealed-secret.repository';
import { SecretSealer } from '@server/modules/auth/keys/secret-sealer.service';

/**
 * Captured from the code at e1dd81be, before the keyring: `EnvKeyProvider`, `SamlService`, `RecoveryCodeService` and the services' own serialisation,
 * run with `security.master-encryption-key` set to these keys. Never regenerate them from the current code: they exist to prove it still agrees.
 */
export const HMAC_TEST_KEY = 'fixture-hmac-key-do-not-use-0123456789';
export const HMAC_DEV_DEFAULT = 'dev-only-insecure-master-encryption-key-do-not-use-in-production';

export const SAML_SUBJECT = { userId: 424242n, entityId: 'https://sp.example.com/metadata' };
export const RECOVERY_CODE_NORMALIZED = 'ABCDE23456';

export const HEAD_DERIVED = {
  [HMAC_TEST_KEY]: {
    samlNameId: 'sp-4428206255bf5b49a90e011ba59d2f163ca8516e93829a364ed25d428838382e',
    recoveryLookupHash: '54a90e1db5d062dfcab8f01b78e1dcb63bd0f0209ce6a16349df8d46df92ab6c',
  },
  [HMAC_DEV_DEFAULT]: {
    samlNameId: 'sp-dd35d99b54e64dcd5d1bbcc313aed31017736626b45f30e97f302a142627733e',
    recoveryLookupHash: 'c2aad5efca636396ef63d2c56fd41e608efc5af2ce6176dd681b814b6a396318',
  },
};

/** Ed25519 PKCS#8 for a seed of 32 `0x07` bytes */
export const SIGNING_KEY_DER_HEX = '302e020100300506032b6570042204200707070707070707070707070707070707070707070707070707070707070707';

export const LEGACY_SIGNING_KEY: LegacySecret = {
  ciphertext: 'AIoxg0nsTcG6LtD1y2IH5YZk2nJ7BvzVylnJM+omVi9cOiFcmca/AuAk9qdi+3BO',
  iv: 'MTgAS7aqYZ9VQ6sl',
  authTag: 'dHcQH+oqEKQAw3lMpR2IHA==',
};

export const IDENTITY_PROVIDER_SECRET = 'google-client-secret-fixture';
export const LEGACY_IDENTITY_PROVIDER: LegacySecret = {
  ciphertext: 'po4GPfDqoRC8Tt4DR8RYEdr0Y+1VvNdAAXTikg==',
  iv: 'qpAc26eAf/JA9wdX',
  authTag: 'NqhFz8Weq7EjYk4c4GEYkA==',
};

export const TOTP_SECRET_HEX = '3132333435363738393031323334353637383930';
export const LEGACY_MFA_SECRET = '{"ciphertext":"nSOmHzuX3LGACJfsaRehjRZtRZM=","iv":"QtTKpGTd6yPcxhNt","authTag":"EUcmI9PaIeX99r2+QkyLXw=="}';

export const WEBHOOK_CURRENT_SECRET = 'whsec_current-fixture';
export const LEGACY_WEBHOOK_CURRENT = '{"ciphertext":"Z+m+jfHRxhJ1A5LGByThMqaEOR5d","iv":"HX5WAf1Jjl94zPoW","authTag":"O5jI5wWaVv0WEzlMkI/jLg=="}';
export const WEBHOOK_PREVIOUS_SECRET = 'whsec_previous-fixture';
export const LEGACY_WEBHOOK_PREVIOUS = '{"ciphertext":"UnHgZRhpY0wjd65dOAnKYtfYitbxQA==","iv":"obapwuTVVzhViqTC","authTag":"iarMRPQuSgGrYlOaBzxGAg=="}';

export const K1 = `k1:${Buffer.alloc(32, 1).toString('base64url')}`;
export const K2 = `k2:${Buffer.alloc(32, 2).toString('base64url')}`;
export const ROTATED = `${K2},${K1}`;

export function sealerFor(keys: string = K1, hmacKey: string = HMAC_TEST_KEY): SecretSealer {
  return new SecretSealer(new SecretBox(parseKeyring(keys)), new LegacyKeyProvider(hmacKey));
}

export interface FakeSealedRow {
  column: SealedColumn;
  id: string;
  legacy: LegacySecret | string | null;
  envelope: unknown;
}

/** Mirrors `SealedSecretRepository`: rows in id order, a compare-and-set on the legacy value for the backfill and on the data key for the rewrap. */
export class FakeSealedSecretStore implements SealedSecretStore {
  rows: FakeSealedRow[] = [];
  failKidCounts = 0;
  rewrapLocked = false;
  batchCalls = 0;
  beforeWrite?: (row: FakeSealedRow) => void;

  add(column: SealedColumn, id: string, legacy: LegacySecret | string | null, envelope: unknown = null): FakeSealedRow {
    const row = { column, id, legacy, envelope };
    this.rows.push(row);
    return row;
  }

  async kidCounts(): Promise<KidCount[]> {
    if (this.failKidCounts > 0 && this.failKidCounts--) throw AppError.internal('connection refused');
    const counts = new Map<string | null, number>();
    for (const row of this.rows.filter(row => row.envelope !== null)) {
      const kid = (row.envelope as Partial<Envelope>).kid ?? null;
      counts.set(kid, (counts.get(kid) ?? 0) + 1);
    }
    return [...counts].map(([kid, rows]) => ({ kid, rows }));
  }

  async backfillBatch(column: SealedColumn, after: string | null, limit: number, seal: SealLegacy): Promise<BackfillBatch> {
    this.batchCalls++;
    const pending = this.rows.filter(row => row.column === column && row.envelope === null && row.legacy !== null && (after === null || row.id > after)).slice(0, limit);
    const batch: BackfillBatch = { cursor: pending.at(-1)?.id ?? null, sealed: 0, skipped: 0, failed: [] };
    for (const row of pending) {
      const legacy = row.legacy as LegacySecret | string;
      const envelope = await seal({ id: row.id, legacy }).catch(() => undefined);
      if (!envelope) {
        batch.failed.push(row.id);
        continue;
      }
      this.beforeWrite?.(row);
      if (row.envelope === null && row.legacy === legacy) {
        row.envelope = envelope;
        batch.sealed++;
      } else batch.skipped++;
    }
    return batch;
  }

  async rewrapStale(activeKeyId: string, rewrap: RewrapSealed): Promise<RewrapResult | undefined> {
    if (this.rewrapLocked) return undefined;
    const result: RewrapResult = { rewrapped: 0, skipped: 0, failed: [] };
    for (const row of this.rows.filter(row => row.envelope !== null && (row.envelope as Partial<Envelope>).kid !== activeKeyId)) {
      const before = row.envelope;
      const envelope = await rewrap(row.column, { id: row.id, envelope: before }).catch(() => undefined);
      if (!envelope) {
        result.failed.push({ column: `${row.column.table}.${row.column.secret}`, id: row.id });
        continue;
      }
      this.beforeWrite?.(row);
      if (row.envelope === before) {
        row.envelope = envelope;
        result.rewrapped++;
      } else result.skipped++;
    }
    return result;
  }
}
