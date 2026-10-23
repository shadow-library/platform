import { type DatabaseTransaction, type PrimaryDatabase } from './database.module';
import { type ExpenseAudit, expenseAudits } from './schemas';

export interface ExpenseAuditEntry {
  accountId: bigint;
  expenseId: string;
  action: ExpenseAudit.Action;
  changes?: ExpenseAudit.Change[];
  deviceId?: string | null;
}

export async function appendExpenseAudit(executor: PrimaryDatabase | DatabaseTransaction, entry: ExpenseAuditEntry): Promise<void> {
  await executor.insert(expenseAudits).values({ ...entry, changes: entry.changes ?? [], deviceId: entry.deviceId ?? null });
}
