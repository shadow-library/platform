/**
 * Importing npm packages
 */
import { Injectable, Optional } from '@shadow-library/app';
import { AppSessionService, parseCookies } from '@shadow-library/auth/module';
import { AppError, Config, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { StorageService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { APP_NAME } from '@server/constants';
import { type Account } from '@server/database';
import { logMetric, pseudoAccountId } from '@server/telemetry';

import { DeletionRepository } from './deletion.repository';
import { IdentityCloseClient } from './identity-close.client';

/**
 * Defining types
 */

/** Row absence is the terminal state — step 6 removes the row the machine lives on (see `DeletionRepository.removeAccount`). */
export type DeletionStatus = Account.DeletionState;

/**
 * Declaring the constants
 */

/** One `drive` call may cross every state once, plus a re-read per contended transition. */
const MAX_TRANSITIONS = 12;

@Injectable()
export class DeletionService {
  private readonly logger = Logger.getLogger(APP_NAME, DeletionService.name);

  constructor(
    private readonly deletionRepository: DeletionRepository,
    private readonly accountContext: AccountContext,
    private readonly storageService: StorageService,
    private readonly identityCloseClient: IdentityCloseClient,
    private readonly context: ContextService,
    @Optional() private readonly sessions?: AppSessionService,
  ) {}

  /**
   * Steps 1–2. Elevation and the `memoir:destructive` scope are already proven by the route's guards;
   * what happens here is the durable marker plus the app-session revoke, in that order — the marker is
   * what makes `AccountContext` refuse this account's next request, so it must land before the session
   * goes away. Steps 3–6 are handed to the background driver; the sweep is the crash backstop.
   */
  async start(): Promise<DeletionStatus> {
    const accountId = this.requireAccountId();
    const started = await this.deletionRepository.markPending(accountId);
    if (!started) return (await this.deletionRepository.findState(accountId)) ?? 'done';

    logMetric(this.logger, 'Account deletion started', 'deletion.started', 1, { pseudoAccountId: pseudoAccountId(accountId) });
    await this.revokeSession();
    this.driveInBackground(accountId);
    return 'pending';
  }

  async status(): Promise<DeletionStatus> {
    const accountId = this.requireAccountId();
    return (await this.deletionRepository.findState(accountId)) ?? 'done';
  }

  /**
   * Steps 3–6. Every step is idempotent and every transition is a single guarded UPDATE, so a crash
   * anywhere resumes by re-reading the state and re-running from there: a lost transition re-runs a
   * step that has nothing left to do, and a transition that lost the race reports zero rows and the
   * loop re-reads instead of skipping ahead.
   */
  async drive(accountId: bigint): Promise<DeletionStatus> {
    for (let transition = 0; transition < MAX_TRANSITIONS; transition++) {
      const state = await this.deletionRepository.findState(accountId);
      if (state === null) return 'done';

      switch (state) {
        case 'none':
        case 'done':
          return state;

        case 'pending':
          await this.deleteBlobs(accountId);
          await this.deletionRepository.advance(accountId, 'pending', 'blobs_deleted');
          break;

        case 'blobs_deleted':
          if (!(await this.purge(accountId))) return 'blobs_deleted';
          await this.deletionRepository.advance(accountId, 'blobs_deleted', 'data_deleted');
          break;

        case 'data_deleted':
          if (!(await this.closeIdentity(accountId))) return 'data_deleted';
          await this.deletionRepository.advance(accountId, 'data_deleted', 'identity_closed');
          break;

        case 'identity_closed':
          await this.finalize(accountId);
          return 'done';
      }
    }

    this.logger.error('deletion state machine exceeded its transition budget', { pseudoAccountId: pseudoAccountId(accountId) });
    return (await this.deletionRepository.findState(accountId)) ?? 'done';
  }

  /** Step 3: both prefixes this account can own objects under — receipts (§19) and exports (§20). A missing key is not a failure, so re-entry is a no-op. */
  private async deleteBlobs(accountId: bigint): Promise<void> {
    let deleted = 0;
    for (const prefix of [`r/${accountId}/`, `exports/${accountId}/`]) {
      const keys = await this.storageService.list(prefix);
      for (const key of keys) {
        await this.storageService.delete(key);
        deleted++;
      }
    }
    logMetric(this.logger, 'Account deletion removed stored objects', 'deletion.blobs_deleted', deleted, { pseudoAccountId: pseudoAccountId(accountId) });
  }

  /** Step 4; `false` means the pass hit its batch budget with rows still standing, and the sweep picks the account up again rather than advancing on a half-purge. */
  private async purge(accountId: bigint): Promise<boolean> {
    const batchSize = Config.get('deletion.purge-batch-size');
    const maxBatches = Config.get('deletion.purge-max-batches');
    const deleted = await this.deletionRepository.purge(accountId, batchSize, maxBatches);
    const complete = !(await this.deletionRepository.hasResidualRows(accountId));
    logMetric(this.logger, 'Account deletion purged relational rows', 'deletion.rows_purged', deleted, { pseudoAccountId: pseudoAccountId(accountId), complete });
    return complete;
  }

  /** Step 5; `false` halts the machine at `data_deleted` and raises the operator-runbook signal (§21.3 option 2). */
  private async closeIdentity(accountId: bigint): Promise<boolean> {
    const identitySub = await this.deletionRepository.findIdentitySub(accountId);
    if (!identitySub) return false;

    const outcome = await this.identityCloseClient.close(identitySub);
    if (outcome === 'closed') return true;

    logMetric(
      this.logger,
      'Account deletion halted: identity close is unavailable',
      'deletion.identity_close_blocked',
      1,
      { pseudoAccountId: pseudoAccountId(accountId), outcome },
      'warn',
    );
    return false;
  }

  /** Step 6: the guarded row removal and the operator-audit line — a pseudonymous id and timestamps, never an identity subject or any user content (§23, §24). */
  private async finalize(accountId: bigint): Promise<void> {
    const remnant = await this.deletionRepository.removeAccount(accountId);
    if (!remnant) return;

    logMetric(this.logger, 'Account deletion completed', 'deletion.completed', 1, {
      pseudoAccountId: pseudoAccountId(remnant.accountId),
      accountCreatedAt: remnant.createdAt.toISOString(),
      deletionStartedAt: remnant.deletionStartedAt?.toISOString() ?? null,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * §21.2: the app session dies with the marker so the browser cannot keep spending a cached token
   * against a half-deleted account. Identity-side revocation cascades from the close in step 5; a
   * bearer caller has no app session here and nothing to revoke.
   */
  private async revokeSession(): Promise<void> {
    if (!this.sessions) return;
    const handle = this.sessions.readHandle(parseCookies(this.context.getRequest(false)?.headers.cookie));
    if (!handle) return;
    await this.sessions.logout(handle).catch((error: Error) => this.logger.warn('app session revoke failed during deletion start', { reason: error.message }));
  }

  private driveInBackground(accountId: bigint): void {
    void this.drive(accountId).catch((error: Error) =>
      this.logger.error('deletion drive failed; the resumption sweep will retry', { pseudoAccountId: pseudoAccountId(accountId), error }),
    );
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('deletion route reached without a resolved account context');
    return accountId;
  }
}
