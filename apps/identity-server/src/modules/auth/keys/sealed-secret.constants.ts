import { InjectionToken } from '@shadow-library/app';
import { type Keyring, type SecretBox } from '@shadow-library/common/crypto';

export type Delay = (ms: number) => Promise<void>;

export type LegacyColumns = { format: 'columns'; ciphertext: string; iv: string; authTag: string } | { format: 'serialized'; column: string };

export interface SealedColumn {
  table: string;
  /** The row identity bound into the context: generated before insert and never updated */
  id: string;
  idType: 'uuid' | 'bigint';
  /** The secret's name in the context, which must never change once rows are sealed */
  secret: string;
  envelope: string;
  legacy: LegacyColumns;
}

export const IDENTITY_KEYRING = new InjectionToken<Keyring>('IDENTITY_KEYRING');
export const IDENTITY_SECRET_BOX = new InjectionToken<SecretBox>('IDENTITY_SECRET_BOX');
export const KEYRING_RETRY_DELAY = new InjectionToken<Delay>('KEYRING_RETRY_DELAY');

export const KEYRING_CHECK_RETRY_MS = 5000;
export const BACKFILL_BATCH_SIZE = 100;

export const SEALED_COLUMNS = {
  signingKey: {
    table: 'signing_keys',
    id: 'kid',
    idType: 'uuid',
    secret: 'private_key',
    envelope: 'private_key_envelope',
    legacy: { format: 'columns', ciphertext: 'private_key_ciphertext', iv: 'private_key_iv', authTag: 'private_key_auth_tag' },
  },
  identityProvider: {
    table: 'identity_providers',
    id: 'id',
    idType: 'uuid',
    secret: 'client_secret',
    envelope: 'client_secret_envelope',
    legacy: { format: 'columns', ciphertext: 'client_secret_ciphertext', iv: 'client_secret_iv', authTag: 'client_secret_auth_tag' },
  },
  mfaSecret: { table: 'mfa_enrollments', id: 'id', idType: 'bigint', secret: 'secret', envelope: 'secret_envelope', legacy: { format: 'serialized', column: 'secret_ciphertext' } },
  webhookSecret: {
    table: 'webhook_subscriptions',
    id: 'id',
    idType: 'bigint',
    secret: 'secret',
    envelope: 'secret_envelope',
    legacy: { format: 'serialized', column: 'secret_ciphertext' },
  },
  webhookPreviousSecret: {
    table: 'webhook_subscriptions',
    id: 'id',
    idType: 'bigint',
    secret: 'previous_secret',
    envelope: 'previous_secret_envelope',
    legacy: { format: 'serialized', column: 'previous_secret_ciphertext' },
  },
} as const satisfies Record<string, SealedColumn>;

export const SEALED_COLUMN_LIST: readonly SealedColumn[] = Object.values(SEALED_COLUMNS);
