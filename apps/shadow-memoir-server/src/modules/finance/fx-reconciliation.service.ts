/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountRepository } from '@modules/auth';
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { type Expense } from '@server/database';

import { logMetric } from '@server/telemetry';

import { type CurrencyPair, HttpFxRateClient } from './fx-rate-client';
import { ExpenseRepository } from './expense.repository';
import { FxRateRepository } from './fx-rate.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const SWEEP_NAME = 'fx-reconciliation';
const NULL_RATE_PAGE_SIZE = 200;
const UNRESOLVED_ALERT_HOURS = 48;
const MS_PER_HOUR = 3_600_000;
const ISO_DATE_LENGTH = 10;

function todayIso(): string {
  return new Date().toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * The hourly worker sweep (ARCHITECTURE §14.1) registered on T-22's `SchedulerService`. Two jobs, one
 * tick, both pairs-only against the provider — never account data:
 *
 * 1. Warm today's rate cache for the pairs currently unresolved, so an expense entered today whose rate
 *    was momentarily unavailable resolves without waiting on a dated lookup.
 * 2. For every expense still carrying a null `fx_rate`, price its own pair at its own `occurred_on`
 *    date (historical fidelity — never today's rate, which would misattribute a past purchase's
 *    conversion) and cache that dated rate in `fx_rates` so a later sweep or another expense on the
 *    same date reuses it without a second provider call.
 */
@Injectable()
export class FxReconciliationService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, FxReconciliationService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly fxRateClient: HttpFxRateClient,
    private readonly fxRateRepository: FxRateRepository,
    private readonly expenseRepository: ExpenseRepository,
    private readonly accountRepository: AccountRepository,
  ) {}

  onModuleInit(): void {
    const cadenceMs = Config.get('fx.reconciliation-interval-minutes') * 60_000;
    this.scheduler.registerSweep(SWEEP_NAME, cadenceMs, () => this.run());
  }

  async run(): Promise<void> {
    const nulls = await this.expenseRepository.findNullRateAcrossAccounts(NULL_RATE_PAGE_SIZE);
    if (nulls.length === 0) return;

    const accounts = await this.accountRepository.findDefaultCurrencies([...new Set(nulls.map(expense => expense.accountId))]);
    const pairFor = (expense: Expense.Row): CurrencyPair | null => {
      const quote = accounts.get(expense.accountId);
      if (!quote || quote === expense.currency) return null;
      return { base: expense.currency, quote };
    };

    const today = todayIso();
    const todaysPairs = new Map<string, CurrencyPair>();
    for (const expense of nulls) {
      const pair = pairFor(expense);
      if (pair) todaysPairs.set(`${pair.base}:${pair.quote}`, pair);
    }
    const warmed = todaysPairs.size > 0 ? await this.fxRateClient.fetchRates([...todaysPairs.values()]) : [];
    for (const rate of warmed) await this.fxRateRepository.upsert(today, rate.base, rate.quote, String(rate.rate));

    let resolved = 0;
    let fetchedForHistory = 0;
    for (const expense of nulls) {
      const pair = pairFor(expense);
      if (!pair) continue;

      let dated = await this.fxRateRepository.findForEntry(expense.occurredOn, pair.base, pair.quote);
      if (!dated?.rate && expense.occurredOn !== today) {
        const [fetchedRate] = await this.fxRateClient.fetchRates([pair], expense.occurredOn);
        fetchedForHistory++;
        if (fetchedRate) {
          await this.fxRateRepository.upsert(expense.occurredOn, pair.base, pair.quote, String(fetchedRate.rate));
          dated = await this.fxRateRepository.findForEntry(expense.occurredOn, pair.base, pair.quote);
        }
      }
      if (!dated?.rate) continue;

      const homeAmountMinor = BigInt(Math.round(Number(expense.amountMinor) * Number(dated.rate)));
      await this.expenseRepository.resolveNullRate(expense.id, dated.rate, homeAmountMinor, expense.occurredOn);
      resolved++;
    }

    const unresolved = nulls.length - resolved;
    const staleUnresolved = nulls.filter(expense => Date.now() - expense.createdAt.getTime() >= UNRESOLVED_ALERT_HOURS * MS_PER_HOUR);
    if (staleUnresolved.length > 0) {
      logMetric(
        this.logger,
        'FX reconciliation: expenses unresolved past the alert threshold',
        'fx_reconciliation.unresolved_stale',
        staleUnresolved.length,
        { thresholdHours: UNRESOLVED_ALERT_HOURS },
        'warn',
      );
    }

    logMetric(this.logger, 'FX reconciliation sweep complete', 'fx_reconciliation.unresolved', unresolved, {
      candidates: nulls.length,
      resolved,
      pairsWarmed: warmed.length,
      historicalFetches: fetchedForHistory,
    });
  }
}
