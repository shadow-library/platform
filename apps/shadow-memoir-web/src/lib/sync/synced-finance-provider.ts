import {
  applyFinanceCommand,
  type CategoriesView,
  type ExpenseDetail,
  type ExpensePage,
  type ExpenseQuery,
  financeCategoriesView,
  type FinanceCommand,
  type FinanceCommandResult,
  financeExpensePage,
  type FinanceProvider,
  type FinanceRange,
  type FinanceState,
  financeSubscriptionsView,
  financeSummary,
  type FinanceSummary,
  type SubscriptionsView,
} from '@/lib/data';

import { isFinanceCommand, mintCommandIds } from './command-wire';
import { projectFinanceRows } from './projection';
import { type SyncEngine } from './sync-engine';

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function toState(rows: ReturnType<typeof projectFinanceRows>, today: string): FinanceState {
  return {
    ...rows,
    receiptScansUsed: rows.expenses.filter(expense => expense.source === 'ocr' && monthOf(expense.occurredOnDate) === monthOf(today)).length,
    monthlyExpenseCount: rows.expenses.filter(expense => monthOf(expense.occurredOnDate) === monthOf(today)).length,
  };
}

/**
 * The finance domain read from the local mirror and written through the outbox. Reads never touch the
 * network; a write applies through the same `applyFinanceCommand` the fixtures run, then queues. A
 * rejected or superseded outcome is corrected by the next delta pull rather than unwound (ADR-0006).
 */
export class SyncedFinanceProvider implements FinanceProvider {
  private state: FinanceState;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly sync: SyncEngine) {
    this.state = toState(projectFinanceRows(sync.domains()), sync.today);
    sync.subscribeWorld(() => void (this.pending = this.pending.then(() => this.reproject())));
  }

  /** Rebuilds from the server's rows, then replays whatever is still queued over them — an acked command has left the queue, so the replay cannot double it. */
  async reproject(): Promise<void> {
    const state = toState(projectFinanceRows(this.sync.domains()), this.sync.today);
    for (const entry of await this.sync.outbox.pending()) if (isFinanceCommand(entry.command)) applyFinanceCommand(state, entry.command);
    this.state = state;
  }

  async summary(range: FinanceRange): Promise<FinanceSummary> {
    return financeSummary(this.state, range);
  }

  async expenses(query: ExpenseQuery): Promise<ExpensePage> {
    return financeExpensePage(this.state, query);
  }

  async expense(id: string): Promise<ExpenseDetail | null> {
    return this.state.expenses.find(expense => expense.id === id) ?? null;
  }

  async subscriptions(): Promise<SubscriptionsView> {
    return financeSubscriptionsView(this.state);
  }

  async categories(): Promise<CategoriesView> {
    return financeCategoriesView(this.state);
  }

  async dispatchCommand(command: FinanceCommand): Promise<FinanceCommandResult> {
    const minted = mintCommandIds(command) as FinanceCommand;
    const result = applyFinanceCommand(this.state, minted);
    await this.sync.enqueue(minted, this.sync.today);
    return result;
  }
}
