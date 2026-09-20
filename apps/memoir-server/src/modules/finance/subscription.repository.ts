/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, schema, type Subscription } from '@server/database';

/**
 * Defining types
 */

export interface SubscriptionCreate {
  accountId: bigint;
  name: string;
  note: string | null;
  amountMinor: bigint;
  amountText: string;
  currency: string;
  frequency: Subscription.Frequency;
  customIntervalDays: number | null;
  billingDay: number;
  nextDueDate: string;
  categoryId: string;
  reminderEnabled: boolean;
  reminderLead: Subscription.ReminderLead;
  monthlyEquivalentMinor: bigint;
}

export type SubscriptionEdit = Partial<
  Pick<
    SubscriptionCreate,
    | 'name'
    | 'note'
    | 'amountMinor'
    | 'amountText'
    | 'frequency'
    | 'customIntervalDays'
    | 'billingDay'
    | 'nextDueDate'
    | 'categoryId'
    | 'reminderEnabled'
    | 'reminderLead'
    | 'monthlyEquivalentMinor'
  > & { active: boolean }
>;

/**
 * Declaring the constants
 */

@Injectable()
export class SubscriptionRepository extends OwnerScopedRepository {
  async list(): Promise<Subscription.Row[]> {
    return (await this.scoped(schema.subscriptions)) as Subscription.Row[];
  }

  async findById(id: bigint): Promise<Subscription.Row | null> {
    const [row] = await this.scoped(schema.subscriptions, eq(schema.subscriptions.id, id));
    return (row as Subscription.Row) ?? null;
  }

  /** Read `FOR UPDATE` inside the confirming transaction, so two concurrent `ConfirmSubscriptionCycle` calls for the same cycle serialize on this row rather than racing past `next_due_date`'s read. */
  async findByIdForUpdateInTx(tx: DatabaseTransaction, id: bigint): Promise<Subscription.Row | null> {
    const rows = await this.using(tx).scoped(schema.subscriptions, eq(schema.subscriptions.id, id)).for('update');
    return (rows[0] as Subscription.Row) ?? null;
  }

  async create(tx: DatabaseTransaction, values: SubscriptionCreate): Promise<Subscription.Row> {
    const [row] = await tx.insert(schema.subscriptions).values(values).returning();
    return row as Subscription.Row;
  }

  async update(tx: DatabaseTransaction, id: bigint, values: SubscriptionEdit): Promise<Subscription.Row | null> {
    const [row] = await this.using(tx).update(schema.subscriptions, values, eq(schema.subscriptions.id, id)).returning();
    return (row as Subscription.Row) ?? null;
  }

  async advanceCycle(tx: DatabaseTransaction, id: bigint, lastConfirmedDate: string, nextDueDate: string): Promise<void> {
    await this.using(tx).update(schema.subscriptions, { lastConfirmedDate, nextDueDate }, eq(schema.subscriptions.id, id));
  }

  async remove(tx: DatabaseTransaction, id: bigint): Promise<boolean> {
    const scope = this.using(tx);
    const deleted = await scope.delete(schema.subscriptions, eq(schema.subscriptions.id, id)).returning({ id: schema.subscriptions.id });
    if (deleted.length === 0) return false;
    await scope.tombstone('subscriptions', String(id));
    return true;
  }
}
