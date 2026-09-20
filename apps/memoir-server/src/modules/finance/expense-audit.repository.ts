/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { appendExpenseAudit, type DatabaseTransaction, type ExpenseAuditEntry, schema } from '@server/database';

@Injectable()
export class ExpenseAuditRepository extends OwnerScopedRepository {
  append(tx: DatabaseTransaction, entry: ExpenseAuditEntry): Promise<void> {
    return appendExpenseAudit(tx, entry);
  }

  /** Rows of a deleted expense carry its owner free text, so they leave every mirror before the `deleted` row, or a re-`created` row for the same id, starts the history again. */
  async removeForExpense(tx: DatabaseTransaction, expenseId: string): Promise<void> {
    const scope = this.using(tx);
    const removed = await scope.delete(schema.expenseAudits, eq(schema.expenseAudits.expenseId, expenseId)).returning({ id: schema.expenseAudits.id });
    for (const row of removed) await scope.tombstone('expense_audits', String(row.id));
  }
}
