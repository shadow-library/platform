/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext, AccountRepository } from '@modules/auth';
import { EntitlementService } from '@modules/billing';
import { CommandLogRepository } from '@modules/commands';
import { addDays, formatLocalDate, instantAtLocalMinute, localDateAt } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import { type Account, type AiTask, type DatabaseTransaction } from '@server/database';

import { type AiTaskDraft, AiTaskRepository } from './ai-task.repository';
import { type AiTaskSubmitDto } from './ai.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class AiTaskService {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly accountRepository: AccountRepository,
    private readonly entitlementService: EntitlementService,
    private readonly commandLogRepository: CommandLogRepository,
    private readonly aiTaskRepository: AiTaskRepository,
  ) {}

  /**
   * Guard order (ARCHITECTURE §15.1): resolve tier → check quota under the account lock → paywall
   * error before any row is written → dedupe on the client-minted id inside the same lock, so a
   * duplicate tap and a fresh submission racing each other never both pass the quota check.
   */
  async submit(dto: AiTaskSubmitDto): Promise<AiTask.Row> {
    const account = await this.requireAccount();
    const tier = await this.entitlementService.getTier(account.id);

    return this.commandLogRepository.runSerialized(account.id, async tx => {
      const existing = await this.aiTaskRepository.findByIdInTx(tx, dto.id);
      if (existing) return existing;

      const now = new Date();
      const today = localDateAt(now.getTime(), account.timezone);
      const quotaMonth = formatLocalDate(today).slice(0, 7);
      await this.enforceQuota(tx, tier, quotaMonth, today, account.timezone);

      const draft: AiTaskDraft = {
        id: dto.id,
        queryText: dto.queryText,
        kind: 'adhoc',
        expectedBy: this.computeExpectedBy(now, account.timezone),
        quotaMonth,
        quotaConsumed: true,
      };
      const inserted = await this.aiTaskRepository.insertPending(tx, draft);
      if (inserted) return inserted;

      const raced = await this.aiTaskRepository.findByIdInTx(tx, dto.id);
      if (!raced) throw AppError.internal(`ai_tasks insert for id '${dto.id}' conflicted but no row could be read back`);
      return raced;
    });
  }

  /** The cancel-vs-claim race (ARCHITECTURE §15.1): a claimed/running task rejects cancel because the guarded UPDATE matches zero rows. */
  async cancel(id: string): Promise<AiTask.Row> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('AiTaskService used without a resolved account context');

    return this.commandLogRepository.runSerialized(accountId, async tx => {
      const existing = await this.aiTaskRepository.findByIdInTx(tx, id);
      if (!existing) throw AppErrorCode.AI_003.create();

      const cancelled = await this.aiTaskRepository.cancelIfPending(tx, id);
      if (!cancelled) throw AppErrorCode.AI_004.create();
      return cancelled;
    });
  }

  private async enforceQuota(tx: DatabaseTransaction, tier: 'free' | 'paid', quotaMonth: string, today: ReturnType<typeof localDateAt>, timezone: string): Promise<void> {
    if (tier === 'paid') {
      const cap = Config.get('quotas.ai-paid-daily');
      const since = new Date(instantAtLocalMinute(today, 0, timezone).instant);
      const used = await this.aiTaskRepository.countConsumedSince(tx, since);
      if (used >= cap) throw AppErrorCode.AI_002.create();
      return;
    }

    const cap = Config.get('quotas.ai-free-monthly');
    const used = await this.aiTaskRepository.countConsumedInMonth(tx, quotaMonth);
    if (used >= cap) throw AppErrorCode.AI_001.create();
  }

  /** "Ready tonight": the next occurrence of `ai.batch-window` at or after now, in the account's own timezone. */
  private computeExpectedBy(now: Date, timezone: string): Date {
    const window = Config.get('ai.batch-window');
    const [hourText, minuteText] = window.split(':');
    const minuteOfDay = Number(hourText) * 60 + Number(minuteText);
    const today = localDateAt(now.getTime(), timezone);

    const todayWindow = instantAtLocalMinute(today, minuteOfDay, timezone).instant;
    if (todayWindow > now.getTime()) return new Date(todayWindow);
    return new Date(instantAtLocalMinute(addDays(today, 1), minuteOfDay, timezone).instant);
  }

  private async requireAccount(): Promise<Account.Row> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('AiTaskService used without a resolved account context');
    const account = await this.accountRepository.findById(accountId);
    if (!account) throw AppError.internal(`resolved account id '${accountId}' has no accounts row`);
    return account;
  }
}
