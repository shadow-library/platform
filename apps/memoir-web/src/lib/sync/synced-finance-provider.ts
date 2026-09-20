import { RECEIPT_MAX_BYTES, receiptApi, receiptContentType, ReceiptUploadError, toReceiptDownloadError, toReceiptUploadError } from '@/lib/apis';
import {
  applyFinanceCommand,
  capAdvisoryForTier,
  type CategoriesView,
  type DispatchOptions,
  type ExpensePage,
  type ExpenseQuery,
  type ExpenseView,
  financeCategoriesView,
  type FinanceCommand,
  type FinanceCommandResult,
  financeExpensePage,
  financeExpenseView,
  type FinanceProvider,
  type FinanceState,
  financeSubscriptionsView,
  financeSummary,
  type FinanceSummary,
  type ReceiptLink,
  type ReceiptScanQuota,
  type ReceiptUploadProgress,
  type SubscriptionsView,
  todayISODate,
} from '@/lib/data';

import { isFinanceCommand, isServerBacked, mintCommandIds } from './command-wire';
import { ignoreAccountBoundary } from './memoir-store';
import { type FinanceRows, mirroredTier, projectFinanceRows } from './projection';
import { type SyncEngine } from './sync-engine';

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function toState(rows: FinanceRows, today: string): FinanceState {
  return {
    ...rows,
    today,
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
    this.state = toState(projectFinanceRows(sync.domains()), todayISODate());
    sync.subscribeProjection(() => this.serialize(() => this.reproject()));
  }

  /** A dispatch applied to the state a running reprojection is about to replace would vanish until the next pull, so the two take turns. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.pending.then(task);
    this.pending = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Rebuilds from the server's rows, then replays whatever is still queued over them as queued — an acked command has left the queue, so the replay cannot double it. */
  async reproject(): Promise<void> {
    const state = toState(projectFinanceRows(this.sync.domains()), todayISODate());
    for (const entry of await this.sync.outbox.pending()) if (isFinanceCommand(entry.command)) applyFinanceCommand(state, entry.command, 'queued');
    this.state = state;
  }

  /** Periods are read against the day the screen is open on, not the day the engine started. */
  private current(): FinanceState {
    return { ...this.state, today: todayISODate() };
  }

  async summary(): Promise<FinanceSummary> {
    return financeSummary(this.current());
  }

  async expenses(query: ExpenseQuery): Promise<ExpensePage> {
    return financeExpensePage(this.current(), query);
  }

  async expense(id: string): Promise<ExpenseView> {
    return financeExpenseView(this.current(), id);
  }

  async subscriptions(): Promise<SubscriptionsView> {
    return financeSubscriptionsView(this.current());
  }

  async categories(): Promise<CategoriesView> {
    return financeCategoriesView(this.current());
  }

  async receiptScanQuota(): Promise<ReceiptScanQuota> {
    const quota = await receiptApi.scanQuota();
    return { cap: quota.cap, used: quota.used, resetAt: quota.resetAt };
  }

  /** The PUT happens when the photo is picked; `confirmReceipt` waits for Save, so an abandoned upload stays `pending_upload` and the server's sweep removes it. */
  async uploadReceipt(file: File, progress: ReceiptUploadProgress): Promise<string> {
    const contentType = receiptContentType(file);
    if (!contentType) throw new ReceiptUploadError('unsupported-type');
    if (file.size > RECEIPT_MAX_BYTES) throw new ReceiptUploadError('too-large');

    try {
      const issued = await receiptApi.create({ contentType, sizeBytes: file.size });
      await receiptApi.putObject(issued.uploadUrl, file, contentType, progress);
      return issued.ref;
    } catch (error) {
      throw toReceiptUploadError(error);
    }
  }

  async confirmReceipt(ref: string): Promise<void> {
    try {
      await receiptApi.confirm(ref);
    } catch (error) {
      throw toReceiptUploadError(error);
    }
  }

  async receiptLink(ref: string): Promise<ReceiptLink> {
    try {
      const link = await receiptApi.download(ref);
      return { url: link.url, expiresAt: link.expiresAt };
    } catch (error) {
      throw toReceiptDownloadError(error);
    }
  }

  dispatchCommand(command: FinanceCommand, options?: DispatchOptions): Promise<FinanceCommandResult> {
    return this.serialize(async () => {
      const minted = mintCommandIds(command) as FinanceCommand;
      const applied = applyFinanceCommand(this.state, minted, isServerBacked(minted) ? 'queued' : 'synced');
      const result = { ...applied, advisory: capAdvisoryForTier(applied.advisory, mirroredTier(this.sync.domains())) };
      const delivery = await this.sync.enqueue(minted, this.sync.today, options);
      if (delivery.status === 'refused') await this.reproject().catch(ignoreAccountBoundary);
      return { ...result, delivery };
    });
  }
}
