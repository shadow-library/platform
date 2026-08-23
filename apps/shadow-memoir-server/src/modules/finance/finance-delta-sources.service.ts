/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource, type SnapshotDeltaSource } from '@modules/sync';
import { type ExpenseCategory, schema } from '@server/database';

import { ExpenseCategoryRepository } from './expense-category.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function toCategoryRow(category: ExpenseCategory.Row): Record<string, unknown> {
  return { id: String(category.id), key: category.key, label: category.label, builtin: category.builtin, active: category.active };
}

/**
 * Registers the `expenses`/`subscriptions`/`categories` domains on the sync assembler (ARCHITECTURE
 * §12.2), mirroring `DeltaRepository`'s keyset shape. `expense_categories` carries no `sync_seq` — a
 * closed, near-static 9-row set per account, small enough that a snapshot (à la `devices`) is cheaper
 * than a watermark column.
 */
@Injectable()
export class FinanceDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly expenseCategoryRepository: ExpenseCategoryRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.keysetSource('expenses', schema.expenses));
    this.registry.register(this.keysetSource('subscriptions', schema.subscriptions));
    this.registry.register(this.categoriesSource());
  }

  private keysetSource(domain: string, table: Parameters<DeltaRepository['fetchSince']>[0]): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }

  private categoriesSource(): SnapshotDeltaSource {
    return { domain: 'expense_categories', kind: 'snapshot', fetch: () => this.expenseCategoryRepository.list().then(categories => categories.map(toCategoryRow)) };
  }
}
