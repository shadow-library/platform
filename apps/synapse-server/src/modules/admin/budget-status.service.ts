import { Injectable } from '@shadow-library/app';

import { ActiveCatalogCache, type BudgetScope, type BudgetSpec, type BudgetWindow } from '@modules/catalog';
import { appCounterKey, type BudgetCounterReading, type BudgetLimits, windowEnd, windowStart } from '@modules/metering';

import { BUDGET_TOP_SUBJECTS } from './admin.constants';
import { LedgerReportRepository, type SubjectCounterRow } from './ledger-report.repository';

export interface AppBudgetUsage extends BudgetCounterReading {
  kind: 'app';
}

export interface SubjectBudgetUsage {
  kind: 'subject';
  activeSubjects: number;
  atLimit: number;
  top: SubjectCounterRow[];
}

export type BudgetUsage = AppBudgetUsage | SubjectBudgetUsage;

export interface BudgetStatus extends BudgetLimits {
  index: number;
  app: string;
  per: BudgetScope;
  window: BudgetWindow;
  windowStart: Date;
  windowEnd: Date;
  usage: BudgetUsage;
}

export interface BudgetStatusReport {
  catalogVersion: number;
  budgets: BudgetStatus[];
}

function limitsOf(budget: BudgetSpec): BudgetLimits {
  return {
    ...(budget.maxCalls !== undefined && { maxCalls: budget.maxCalls }),
    ...(budget.maxListCostUsd !== undefined && { maxListCostUsd: budget.maxListCostUsd }),
  };
}

/** That budget's counter is the `app` subject's row, holding every call of the app rather than one subject's, so the subject view leaves it out */
function hasAppBudget(budgets: readonly BudgetSpec[], budget: BudgetSpec): boolean {
  return budgets.some(other => other.per === 'app' && other.app === budget.app && other.window === budget.window);
}

@Injectable()
export class BudgetStatusService {
  constructor(
    private readonly cache: ActiveCatalogCache,
    private readonly ledger: LedgerReportRepository,
  ) {}

  async status(now: Date = new Date()): Promise<BudgetStatusReport> {
    const { version, document } = this.cache.requireCurrent();
    const budgets = await Promise.all(
      document.budgets.map(async (budget, index): Promise<BudgetStatus> => ({
        index,
        app: budget.app,
        per: budget.per,
        window: budget.window,
        ...limitsOf(budget),
        windowStart: windowStart(budget.window, now),
        windowEnd: windowEnd(budget.window, now),
        usage: await this.usageOf(budget, document.budgets, now),
      })),
    );
    return { catalogVersion: version, budgets };
  }

  /** Budgets of one app, scope and window share counter rows, as admission keys them, so each reports the same usage against its own limits */
  private async usageOf(budget: BudgetSpec, budgets: readonly BudgetSpec[], now: Date): Promise<BudgetUsage> {
    const appKey = appCounterKey(budget.app, budget.window, now);
    if (budget.per === 'app') {
      const counter = await this.ledger.budgetCounter(appKey);
      return { kind: 'app', calls: counter?.calls ?? 0, listCostUsd: counter?.listCostUsd ?? 0 };
    }

    const summary = await this.ledger.subjectCounters({
      app: budget.app,
      window: budget.window,
      windowStart: appKey.windowStart,
      limits: limitsOf(budget),
      top: BUDGET_TOP_SUBJECTS,
      ...(hasAppBudget(budgets, budget) && { excluding: appKey }),
    });
    return { kind: 'subject', ...summary };
  }
}
