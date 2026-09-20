/**
 * Importing npm packages
 */
import { and, eq, lt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { appendExpenseAudit, type DatabaseTransaction, type Receipt, schema } from '@server/database';

/**
 * Defining types
 */

export interface ReceiptCreate {
  ref: string;
  accountId: bigint;
  contentType: string;
  sizeBytes: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class ReceiptRepository extends OwnerScopedRepository {
  async create(values: ReceiptCreate): Promise<Receipt.Row> {
    const [row] = await this.db
      .insert(schema.receipts)
      .values({ ...values, status: 'pending_upload' })
      .returning();
    return row as Receipt.Row;
  }

  async findByRef(ref: string): Promise<Receipt.Row | null> {
    const [row] = await this.scoped(schema.receipts, eq(schema.receipts.ref, ref));
    return (row as Receipt.Row) ?? null;
  }

  async findByRefForUpdateInTx(tx: DatabaseTransaction, ref: string): Promise<Receipt.Row | null> {
    const [row] = await this.using(tx).scoped(schema.receipts, eq(schema.receipts.ref, ref)).for('update');
    return (row as Receipt.Row) ?? null;
  }

  /** Only the upload that moves a receipt out of `pending_upload` records it on the expense already pointing at it; `expense.create` records the opposite order. */
  async markStored(ref: string, sizeBytes: number, contentType: string): Promise<Receipt.Row | null> {
    return this.transaction(async tx => {
      const scope = this.using(tx);
      const [row] = await scope
        .update(schema.receipts, { status: 'stored', sizeBytes, contentType }, eq(schema.receipts.ref, ref), eq(schema.receipts.status, 'pending_upload'))
        .returning();
      if (!row) return null;

      const receipt = row as Receipt.Row;
      const [expense] = await scope.scoped(schema.expenses, eq(schema.expenses.receiptRef, ref)).limit(1);
      if (expense) await appendExpenseAudit(tx, { accountId: receipt.accountId, expenseId: String(expense['id']), action: 'receipt_confirmed' });
      return receipt;
    });
  }

  /** Owner-scoped removal for the confirm-step reject path (bad upload) and the delete endpoint; returns whether a row was actually removed. */
  async remove(ref: string): Promise<boolean> {
    const scope = this.using(this.db);
    const deleted = await scope.delete(schema.receipts, eq(schema.receipts.ref, ref)).returning({ ref: schema.receipts.ref });
    return deleted.length > 0;
  }

  /** Same as `remove`, bound to the caller's transaction — the expense-deletion cascade (§19.2) needs the receipt row gone in the same tx as the expense row. */
  async removeInTx(tx: DatabaseTransaction, ref: string): Promise<boolean> {
    const scope = this.using(tx);
    const deleted = await scope.delete(schema.receipts, eq(schema.receipts.ref, ref)).returning({ ref: schema.receipts.ref });
    return deleted.length > 0;
  }

  /** Machine path for the pending-upload orphan sweep (§19.2a), which walks every account rather than one caller's own. */
  async findStalePendingUploads(olderThan: Date, limit: number): Promise<Receipt.Row[]> {
    return (await this.db
      .select()
      .from(schema.receipts)
      .where(and(eq(schema.receipts.status, 'pending_upload'), lt(schema.receipts.createdAt, olderThan)))
      .limit(limit)) as Receipt.Row[];
  }

  /** Unscoped delete for the two orphan sweeps, which act on rows/refs outside any request's own account context. */
  async removeByRefUnscoped(ref: string): Promise<void> {
    await this.db.delete(schema.receipts).where(eq(schema.receipts.ref, ref));
  }

  /** Every ref currently on file for `accountId`, for the object-orphan sweep (§19.2b) to diff against a bucket-prefix listing. */
  async refsForAccount(accountId: bigint): Promise<Set<string>> {
    const rows = await this.db.select({ ref: schema.receipts.ref }).from(schema.receipts).where(eq(schema.receipts.accountId, accountId));
    return new Set(rows.map(row => row.ref));
  }
}
