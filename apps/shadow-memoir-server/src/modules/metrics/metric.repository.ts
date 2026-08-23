/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type Metric, schema } from '@server/database';

import { currentThresholdOffers, type ThresholdOffer } from './threshold-offer';

/**
 * Defining types
 */

export interface BuiltinMetric {
  name: string;
  unit: string | null;
  valueType: Metric.ValueType;
  direction: Metric.Direction;
  defaultValue: string | null;
  isHealth: boolean;
}

export interface MetricCreate {
  accountId: bigint;
  name: string;
  unit: string | null;
  valueType: Metric.ValueType;
  direction: Metric.Direction;
  defaultValue: string | null;
  glyph: string | null;
}

export type MetricEdit = Partial<Pick<MetricCreate, 'name' | 'unit' | 'valueType' | 'direction' | 'defaultValue' | 'glyph'>>;

/**
 * Declaring the constants
 */

/** The built-in health set (ARCHITECTURE §18, PRODUCT.md §6.1) — steps, calories burned, sleep, water — all `is_health: true`, none deletable through `metric.delete` (§9). */
export const BUILTIN_METRICS: readonly BuiltinMetric[] = [
  { name: 'Steps', unit: 'steps', valueType: 'count', direction: 'higher', defaultValue: null, isHealth: true },
  { name: 'Calories burned', unit: 'kcal', valueType: 'number', direction: 'higher', defaultValue: null, isHealth: true },
  { name: 'Sleep duration', unit: 'hr', valueType: 'duration', direction: 'higher', defaultValue: null, isHealth: true },
  { name: 'Water', unit: 'ml', valueType: 'number', direction: 'higher', defaultValue: null, isHealth: true },
];

@Injectable()
export class MetricRepository extends OwnerScopedRepository {
  async list(): Promise<Metric.Row[]> {
    return (await this.scoped(schema.metrics)) as Metric.Row[];
  }

  async findById(id: bigint): Promise<Metric.Row | null> {
    const [row] = (await this.scoped(schema.metrics, eq(schema.metrics.id, id))) as Metric.Row[];
    return row ?? null;
  }

  async findByIdInTx(tx: DatabaseTransaction, id: bigint): Promise<Metric.Row | null> {
    const [row] = (await this.using(tx).scoped(schema.metrics, eq(schema.metrics.id, id))) as Metric.Row[];
    return row ?? null;
  }

  /** Mirrors `ExpenseCategoryRepository.ensureSeeded` (T-25): one multi-row `ON CONFLICT DO NOTHING` insert, idempotent and race-safe under the account's `(account_id, name)` unique constraint. */
  async ensureBuiltinsSeeded(tx: DatabaseTransaction, accountId: bigint): Promise<void> {
    await tx
      .insert(schema.metrics)
      .values(
        BUILTIN_METRICS.map(metric => ({
          accountId,
          name: metric.name,
          unit: metric.unit,
          valueType: metric.valueType,
          direction: metric.direction,
          defaultValue: metric.defaultValue,
          builtin: true,
          isHealth: metric.isHealth,
        })),
      )
      .onConflictDoNothing({ target: [schema.metrics.accountId, schema.metrics.name] });
  }

  async create(tx: DatabaseTransaction, values: MetricCreate): Promise<Metric.Row> {
    const [row] = await tx
      .insert(schema.metrics)
      .values({ ...values, builtin: false, isHealth: false })
      .returning();
    return row as Metric.Row;
  }

  async update(tx: DatabaseTransaction, id: bigint, values: MetricEdit): Promise<Metric.Row | null> {
    const [row] = (await this.using(tx)
      .update(schema.metrics, { ...values, updatedAt: new Date() }, eq(schema.metrics.id, id))
      .returning()) as Metric.Row[];
    return row ?? null;
  }

  async deactivate(tx: DatabaseTransaction, id: bigint): Promise<Metric.Row | null> {
    const [row] = (await this.using(tx).update(schema.metrics, { active: false, updatedAt: new Date() }, eq(schema.metrics.id, id)).returning()) as Metric.Row[];
    return row ?? null;
  }

  /** The `getPostgresClient()` restriction confines a raw read of another module's tables to a `*.repository.ts` file — this just forwards to `this.db`, already resolved by `OwnerScopedRepository`. */
  currentOffers(accountId: bigint): Promise<ThresholdOffer[]> {
    return currentThresholdOffers(this.db, accountId);
  }
}
