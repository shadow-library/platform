/**
 * Importing user defined packages
 */
import { type DatabaseTransaction, type PrimaryDatabase } from './database.module';
import { type ExpenseAudit, expenseAudits } from './schemas';

/**
 * Defining types
 */

export interface ExpenseAuditEntry {
  accountId: bigint;
  expenseId: string;
  action: ExpenseAudit.Action;
  changes?: ExpenseAudit.Change[];
  deviceId?: string | null;
}

/**
 * Declaring the constants
 */

export async function appendExpenseAudit(executor: PrimaryDatabase | DatabaseTransaction, entry: ExpenseAuditEntry): Promise<void> {
  await executor.insert(expenseAudits).values({ ...entry, changes: entry.changes ?? [], deviceId: entry.deviceId ?? null });
}
