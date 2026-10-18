import { Inject, Injectable } from '@shadow-library/app';
import { type Envelope, type SecretBox } from '@shadow-library/common/crypto';

import { AppErrorCode } from '@server/classes';

import { LegacyKeyProvider, type StoredLegacySecret } from './legacy-key-provider';
import { IDENTITY_SECRET_BOX, type SealedColumn } from './sealed-secret.constants';

export interface StoredSecret {
  envelope: Envelope | null;
  legacy: StoredLegacySecret | null;
}

export type SecretOwner = string | bigint;

export function sealedSecretContext(column: SealedColumn, owner: SecretOwner): string {
  return `identity:${column.table}:${owner.toString()}:${column.secret}`;
}

/**
 * Seals every stored secret into an envelope bound to its row and column. Reads prefer the envelope; a row holding only legacy columns was written by the
 * previous image while the rollout ran, or has not been backfilled yet, and is read through the legacy key for this one release.
 */
@Injectable()
export class SecretSealer {
  constructor(
    @Inject(IDENTITY_SECRET_BOX) private readonly box: SecretBox,
    private readonly legacy: LegacyKeyProvider,
  ) {}

  seal(plaintext: Buffer | string, column: SealedColumn, owner: SecretOwner): Promise<Envelope> {
    return this.box.seal(plaintext, sealedSecretContext(column, owner));
  }

  async open(stored: StoredSecret, column: SealedColumn, owner: SecretOwner): Promise<Buffer> {
    if (stored.envelope !== null) return this.box.open(stored.envelope, sealedSecretContext(column, owner));
    if (stored.legacy === null) return AppErrorCode.KEY_001.throw();
    return this.legacy.decrypt(stored.legacy);
  }

  async sealLegacy(legacy: StoredLegacySecret, column: SealedColumn, owner: SecretOwner): Promise<Envelope> {
    const plaintext = this.legacy.decrypt(legacy);
    try {
      return await this.seal(plaintext, column, owner);
    } finally {
      plaintext.fill(0);
    }
  }

  rewrap(envelope: Envelope, column: SealedColumn, owner: SecretOwner): Promise<Envelope> {
    return this.box.rewrap(envelope, sealedSecretContext(column, owner));
  }
}
