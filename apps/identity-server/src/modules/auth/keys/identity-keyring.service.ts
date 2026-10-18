import { Inject, Injectable, type OnApplicationReady, type OnModuleInit } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { CryptoErrorCode, type Envelope, isEnvelope, type Keyring } from '@shadow-library/common/crypto';

import { APP_NAME } from '@server/constants';

import { backfillSealedSecrets } from './secret-backfill';
import { columnLabel, type KidCount, SealedSecretRepository, type SealedSecretStore } from './sealed-secret.repository';
import { type Delay, IDENTITY_KEYRING, KEYRING_CHECK_RETRY_MS, KEYRING_RETRY_DELAY, type SealedColumn } from './sealed-secret.constants';
import { SecretSealer } from './secret-sealer.service';

/**
 * Boot blocks in `onModuleInit` until the keys every sealed secret uses are known to be in the keyring, so the replica never turns ready without them:
 * a database it cannot reach is retried, and a key missing from the keyring fails the boot, since only a new keyring can fix it. Once ready, rows an
 * old image left legacy-only are sealed and rows on an older key are rewrapped, in the background.
 */
@Injectable()
export class IdentityKeyringService implements OnModuleInit, OnApplicationReady {
  private readonly logger = Logger.getLogger(APP_NAME, IdentityKeyringService.name);
  private maintaining: Promise<void> | null = null;

  constructor(
    @Inject(SealedSecretRepository) private readonly store: SealedSecretStore,
    @Inject(IDENTITY_KEYRING) private readonly keyring: Keyring,
    private readonly sealer: SecretSealer,
    @Inject(KEYRING_RETRY_DELAY) private readonly delay: Delay,
  ) {}

  async onModuleInit(): Promise<void> {
    const counts = await this.readKidCounts();
    const missing = counts.filter((count): count is KidCount & { kid: string } => count.kid !== null && !this.keyring.has(count.kid));
    if (missing.length === 0) return;
    this.logger.error('Sealed secrets use keys the keyring lacks; refusing to become ready', { missing, activeKeyId: this.keyring.activeKeyId });
    throw CryptoErrorCode.UNKNOWN_KEY.create({ kid: missing.map(count => count.kid).join(',') });
  }

  onApplicationReady(): void {
    void this.maintain();
  }

  maintain(): Promise<void> {
    this.maintaining ??= this.runMaintenance().finally(() => (this.maintaining = null));
    return this.maintaining;
  }

  private async readKidCounts(): Promise<KidCount[]> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.store.kidCounts();
      } catch (error) {
        this.logger.warn('Could not read which keys the sealed secrets use; retrying before becoming ready', { attempt, error });
        await this.delay(KEYRING_CHECK_RETRY_MS);
      }
    }
  }

  private async runMaintenance(): Promise<void> {
    await this.backfill();
    await this.rewrap();
  }

  private async backfill(): Promise<void> {
    try {
      const result = await backfillSealedSecrets(this.store, this.sealer);
      if (result.failed.length > 0) this.logger.error('Sealed the legacy secrets, but some could not be read', { ...result });
      else if (result.sealed > 0 || result.skipped > 0) this.logger.info('Sealed legacy secrets an earlier image wrote', { ...result });
    } catch (error) {
      this.logger.error('Failed to seal the legacy secrets', { error });
    }
  }

  private async rewrap(): Promise<void> {
    const activeKeyId = this.keyring.activeKeyId;
    try {
      const result = await this.store.rewrapStale(activeKeyId, (column, row) => this.rewrapOne(column, row.id, row.envelope));
      if (!result) return this.logger.info('Skipped the secret rewrap; another replica holds the lock', { activeKeyId });
      const metadata = { activeKeyId, ...result };
      if (result.failed.length > 0) this.logger.error('Rewrapped the sealed secrets, but some could not be read', metadata);
      else this.logger.info('Rewrapped the sealed secrets', metadata);
    } catch (error) {
      this.logger.error('Failed to rewrap the sealed secrets', { activeKeyId, error });
    }
  }

  private async rewrapOne(column: SealedColumn, id: string, envelope: unknown): Promise<Envelope> {
    try {
      if (!isEnvelope(envelope)) return CryptoErrorCode.DECRYPTION_FAILED.throw();
      return await this.sealer.rewrap(envelope, column, id);
    } catch (error) {
      this.logger.error('Could not rewrap a sealed secret', { column: columnLabel(column), id, code: AppError.is(error) ? error.code : 'unknown' });
      throw error;
    }
  }
}
