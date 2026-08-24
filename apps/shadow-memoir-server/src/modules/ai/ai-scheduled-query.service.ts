/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { EntitlementService } from '@modules/billing';
import { AppErrorCode } from '@server/classes';
import { type AiScheduledQuery } from '@server/database';

import { AiScheduledQueryRepository } from './ai-scheduled-query.repository';
import { type AiScheduledQueryUpsertDto } from './ai.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Paid-gated end to end (ARCHITECTURE §25: "memoir:account + paid" on both PUT and DELETE) — a lapsed account's existing row is simply never materialized by the worker (§15.7), but managing it still requires the subscription. */
@Injectable()
export class AiScheduledQueryService {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly entitlementService: EntitlementService,
    private readonly repository: AiScheduledQueryRepository,
  ) {}

  async get(): Promise<AiScheduledQuery.Row | null> {
    return this.repository.find();
  }

  async put(dto: AiScheduledQueryUpsertDto): Promise<AiScheduledQuery.Row> {
    await this.requirePaidTier();
    return this.repository.upsert(dto.queryText, dto.active);
  }

  async remove(): Promise<void> {
    await this.requirePaidTier();
    await this.repository.remove();
  }

  private async requirePaidTier(): Promise<void> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('AiScheduledQueryService used without a resolved account context');
    const tier = await this.entitlementService.getTier(accountId);
    if (tier !== 'paid') throw AppErrorCode.AI_005.create();
  }
}
