/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type ExpenseCategory, schema } from '@server/database';

/**
 * Defining types
 */

interface BuiltinCategory {
  key: string;
  label: string;
}

/**
 * Declaring the constants
 */

/** The 9 fixed categories (PRD §2.5); user-scoped rows rather than a code constant so a later product change to custom categories needs no migration (ARCHITECTURE §10.3 O-5). */
export const BUILTIN_CATEGORIES: readonly BuiltinCategory[] = [
  { key: 'food', label: 'Food' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'transport', label: 'Transport' },
  { key: 'bills', label: 'Bills' },
  { key: 'health', label: 'Health' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'home', label: 'Home' },
  { key: 'subs', label: 'Subscriptions' },
  { key: 'uncat', label: 'Uncategorised' },
];

@Injectable()
export class ExpenseCategoryRepository extends OwnerScopedRepository {
  async list(): Promise<ExpenseCategory.Row[]> {
    return (await this.scoped(schema.expenseCategories)) as ExpenseCategory.Row[];
  }

  /**
   * Called at the top of every finance command (idempotent, U-converged): a single multi-row INSERT with
   * `ON CONFLICT DO NOTHING` against `expense_categories_account_id_key_unique` — the account's first
   * finance touch seeds all 9 rows, and every touch after that finds them already there. Two concurrent
   * first touches from different devices both issue this insert; Postgres's unique index resolves the
   * race, so neither observes a partial seed.
   */
  async ensureSeeded(tx: DatabaseTransaction, accountId: bigint): Promise<void> {
    await tx
      .insert(schema.expenseCategories)
      .values(BUILTIN_CATEGORIES.map(category => ({ accountId, key: category.key, label: category.label, builtin: true })))
      .onConflictDoNothing({ target: [schema.expenseCategories.accountId, schema.expenseCategories.key] });
  }
}
