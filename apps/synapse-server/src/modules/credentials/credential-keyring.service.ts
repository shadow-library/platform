import { Inject, Injectable, type OnApplicationReady, type OnModuleInit } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { CryptoErrorCode, type Envelope, isEnvelope, type Keyring, type SecretBox } from '@shadow-library/common/crypto';

import { APP_NAME } from '@server/constants';

import { type CatalogTimers } from '@modules/catalog/active-catalog.cache';

import { CREDENTIAL_BOX, CREDENTIAL_KEYRING, CREDENTIAL_TIMERS } from './credential.constants';
import { CredentialRepository, type KidCount, type RewrapCandidate } from './credential.repository';
import { credentialContext } from './credential.utils';

export const KEYRING_CHECK_RETRY_MS = 5000;

/**
 * Boot blocks in `onModuleInit` until the keys every stored credential uses are known to be in the keyring, so the replica never turns ready
 * without them: a database it cannot reach is retried, and a key missing from the keyring fails the boot, since only a new keyring can fix it.
 * Once ready, a background rewrap moves rows onto the active key.
 */
@Injectable()
export class CredentialKeyringService implements OnModuleInit, OnApplicationReady {
  private readonly logger = Logger.getLogger(APP_NAME, CredentialKeyringService.name);
  private rewrapping: Promise<void> | null = null;

  constructor(
    private readonly repository: CredentialRepository,
    @Inject(CREDENTIAL_KEYRING) private readonly keyring: Keyring,
    @Inject(CREDENTIAL_BOX) private readonly box: SecretBox,
    @Inject(CREDENTIAL_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  async onModuleInit(): Promise<void> {
    const counts = await this.readKidCounts();
    const missing = counts.filter((count): count is KidCount & { kid: string } => count.kid !== null && !this.keyring.has(count.kid));
    if (missing.length === 0) return;
    this.logger.error('Stored credentials use keys the keyring lacks; refusing to become ready', { missing, activeKeyId: this.keyring.activeKeyId });
    throw CryptoErrorCode.UNKNOWN_KEY.create({ kid: missing.map(count => count.kid).join(',') });
  }

  onApplicationReady(): void {
    void this.rewrap();
  }

  rewrap(): Promise<void> {
    this.rewrapping ??= this.runRewrap().finally(() => (this.rewrapping = null));
    return this.rewrapping;
  }

  private async readKidCounts(): Promise<KidCount[]> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.repository.kidCounts();
      } catch (error) {
        this.logger.warn('Could not read which keys the stored credentials use; retrying before becoming ready', { attempt, error });
        await this.timers.after(KEYRING_CHECK_RETRY_MS).elapsed;
      }
    }
  }

  private async runRewrap(): Promise<void> {
    const activeKeyId = this.keyring.activeKeyId;
    try {
      const result = await this.repository.rewrapStale(activeKeyId, candidate => this.rewrapOne(candidate));
      if (!result) return this.logger.info('Skipped the credential rewrap; another replica holds the lock', { activeKeyId });
      const metadata = { activeKeyId, ...result };
      if (result.failed.length > 0) this.logger.error('Rewrapped the stored credentials, but some could not be read', metadata);
      else this.logger.info('Rewrapped the stored credentials', metadata);
    } catch (error) {
      this.logger.error('Failed to rewrap the stored credentials', { activeKeyId, error });
    }
  }

  private async rewrapOne(candidate: RewrapCandidate): Promise<Envelope> {
    try {
      if (!isEnvelope(candidate.secret)) return CryptoErrorCode.DECRYPTION_FAILED.throw();
      return await this.box.rewrap(candidate.secret, credentialContext(candidate.id));
    } catch (error) {
      this.logger.error('Could not rewrap a stored credential', { credential: candidate.id, kid: candidate.kid, code: AppError.is(error) ? error.code : 'unknown' });
      throw error;
    }
  }
}
