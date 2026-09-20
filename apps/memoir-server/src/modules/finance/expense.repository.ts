/**
 * Importing npm packages
 */
import { eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type Expense, schema, syncStamped } from '@server/database';

/**
 * Defining types
 */

export interface ExpenseCreate {
  id: string;
  accountId: bigint;
  amountMinor: bigint;
  amountText: string;
  currency: string;
  fxRate: string | null;
  homeAmountMinor: bigint | null;
  fxRateDate: string | null;
  categoryId: string;
  merchant: string | null;
  note: string | null;
  receiptRef: string | null;
  lineItems: unknown;
  occurredOn: string;
  source: Expense.Source;
  linkedQuestId: bigint | null;
  linkedSubscriptionId: bigint | null;
  billingCycleDate: string | null;
}

export type ExpenseEdit = Partial<Pick<ExpenseCreate, 'amountMinor' | 'amountText' | 'fxRate' | 'homeAmountMinor' | 'categoryId' | 'merchant' | 'note' | 'occurredOn'>>;

/**
 * Declaring the constants
 */

@Injectable()
export class ExpenseRepository extends OwnerScopedRepository {
  async findById(id: string): Promise<Expense.Row | null> {
    const [row] = await this.scoped(schema.expenses, eq(schema.expenses.id, id));
    return (row as Expense.Row) ?? null;
  }

  /** Reads inside the command's own transaction, so an update sees the row its own command just locked in. */
  async findByIdInTx(tx: DatabaseTransaction, id: string): Promise<Expense.Row | null> {
    const [row] = await this.using(tx).scoped(schema.expenses, eq(schema.expenses.id, id));
    return (row as Expense.Row) ?? null;
  }

  async create(tx: DatabaseTransaction, values: ExpenseCreate): Promise<Expense.Row> {
    const [row] = await tx.insert(schema.expenses).values(values).returning();
    return row as Expense.Row;
  }

  async update(tx: DatabaseTransaction, id: string, values: ExpenseEdit): Promise<Expense.Row | null> {
    const [row] = await this.using(tx).update(schema.expenses, values, eq(schema.expenses.id, id)).returning();
    return (row as Expense.Row) ?? null;
  }

  async remove(tx: DatabaseTransaction, id: string): Promise<boolean> {
    const scope = this.using(tx);
    const deleted = await scope.delete(schema.expenses, eq(schema.expenses.id, id)).returning({ id: schema.expenses.id });
    if (deleted.length === 0) return false;
    await scope.tombstone('expenses', id);
    return true;
  }

  /** Machine path for the reconciliation sweep, which resolves nulls across every account (ARCHITECTURE §14.1), never scoped to one caller's own. */
  async findNullRateAcrossAccounts(limit: number): Promise<Expense.Row[]> {
    return (await this.db.select().from(schema.expenses).where(isNull(schema.expenses.fxRate)).limit(limit)) as Expense.Row[];
  }

  /** Fills a null rate under its own transaction, re-stamping `sync_seq` (§12.2) so the fix reaches every client on the next pull. Bypasses `OwnerScopedRepository`'s ambient scoping deliberately — the reconciliation sweep runs with no request context. */
  async resolveNullRate(id: string, fxRate: string, homeAmountMinor: bigint, fxRateDate: string): Promise<void> {
    await this.transaction(async tx => {
      await tx.update(schema.expenses).set(syncStamped(schema.expenses, { fxRate, homeAmountMinor, fxRateDate })).where(eq(schema.expenses.id, id));
    });
  }
}
