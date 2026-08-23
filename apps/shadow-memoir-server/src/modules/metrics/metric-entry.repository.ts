/**
 * Importing npm packages
 */
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type MetricEntry, schema } from '@server/database';

/**
 * Defining types
 */

export interface MetricEntryRegister {
  metricId: bigint;
  date: string;
  value: string;
  source: MetricEntry.Source;
  questLogId: bigint | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class MetricEntryRepository extends OwnerScopedRepository {
  async findForDate(metricId: bigint, date: string): Promise<MetricEntry.Row | null> {
    const [row] = (await this.scoped(schema.metricEntries, eq(schema.metricEntries.metricId, metricId), eq(schema.metricEntries.date, date))) as MetricEntry.Row[];
    return row ?? null;
  }

  /**
   * The §10.3 uniqueness, split by source: a quest-sourced entry is one-per-(quest log, metric) and
   * never overwrites another quest log's entry (`onConflictDoNothing`, converging on whichever landed
   * first — matching the `quest_logs` occurrence convergence philosophy); a non-quest source is
   * one-per-(metric, date, source) and a same-day re-log overwrites in place (`onConflictDoUpdate`,
   * PRD §3.8/ARCHITECTURE §18's "Weight rule generalized").
   */
  async register(tx: DatabaseTransaction, accountId: bigint, entry: MetricEntryRegister): Promise<MetricEntry.Row> {
    if (entry.source === 'quest_log') {
      if (!entry.questLogId) throw AppError.internal("metric_entries.source = 'quest_log' requires a questLogId");
      const [row] = await tx
        .insert(schema.metricEntries)
        .values({ accountId, metricId: entry.metricId, date: entry.date, value: entry.value, source: entry.source, questLogId: entry.questLogId })
        .onConflictDoNothing({ target: [schema.metricEntries.questLogId, schema.metricEntries.metricId], where: isNotNull(schema.metricEntries.questLogId) })
        .returning();
      if (row) return row as MetricEntry.Row;
      const [existing] = await tx
        .select()
        .from(schema.metricEntries)
        .where(and(eq(schema.metricEntries.questLogId, entry.questLogId), eq(schema.metricEntries.metricId, entry.metricId)));
      if (!existing) throw AppError.internal('metric entry conflict resolved to no row');
      return existing as MetricEntry.Row;
    }

    const [row] = await tx
      .insert(schema.metricEntries)
      .values({ accountId, metricId: entry.metricId, date: entry.date, value: entry.value, source: entry.source, questLogId: null })
      .onConflictDoUpdate({
        target: [schema.metricEntries.accountId, schema.metricEntries.metricId, schema.metricEntries.date, schema.metricEntries.source],
        targetWhere: ne(schema.metricEntries.source, 'quest_log'),
        set: { value: entry.value },
      })
      .returning();
    if (!row) throw AppError.internal('metric entry upsert returned no row');
    return row as MetricEntry.Row;
  }
}
