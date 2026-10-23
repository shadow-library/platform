import { and, eq } from 'drizzle-orm';

import { type SqlExecutor } from '@modules/auth';
import { type Metric, type MetricEntry, type PrimaryDatabase, schema } from '@server/database';

/** `quests.health_threshold`'s shape, kept opaque at the schema layer and interpreted only here. */
interface HealthThreshold {
  metricId: string;
  value: number;
  comparison: 'gte' | 'lte';
}

export interface ThresholdOffer {
  questId: bigint;
  questName: string;
  metricId: bigint;
  date: string;
  thresholdValue: number;
  currentValue: number;
  comparison: HealthThreshold['comparison'];
}

function parseHealthThreshold(raw: unknown): HealthThreshold | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { metricId, value, comparison } = raw as Record<string, unknown>;
  if (typeof metricId !== 'string' || typeof value !== 'number' || (comparison !== 'gte' && comparison !== 'lte')) return null;
  return { metricId, value, comparison };
}

function crossed(threshold: HealthThreshold, currentValue: number): boolean {
  return threshold.comparison === 'gte' ? currentValue >= threshold.value : currentValue <= threshold.value;
}

/**
 * Scans the account's active quests for a `health_threshold` naming this metric and surfaces an offer only where the threshold is crossed and
 * no `quest_logs` row exists for (quest, date).
 * Never writes; the client's own `CompleteQuest` is what grants the reward.
 */
export async function findThresholdOffers(executor: SqlExecutor, accountId: bigint, metric: Metric.Row, entry: MetricEntry.Row): Promise<ThresholdOffer[]> {
  const quests = await executor
    .select()
    .from(schema.quests)
    .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.active, true)));

  const offers: ThresholdOffer[] = [];
  for (const quest of quests) {
    const threshold = parseHealthThreshold(quest.healthThreshold);
    if (!threshold || threshold.metricId !== String(metric.id)) continue;
    if (!crossed(threshold, Number(entry.value))) continue;

    const [existingLog] = await executor
      .select({ id: schema.questLogs.id })
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), eq(schema.questLogs.questId, quest.id), eq(schema.questLogs.date, entry.date)));
    if (existingLog) continue;

    offers.push({
      questId: quest.id,
      questName: quest.name,
      metricId: metric.id,
      date: entry.date,
      thresholdValue: threshold.value,
      currentValue: Number(entry.value),
      comparison: threshold.comparison,
    });
  }
  return offers;
}

/** The full current offer set, recomputed live from the latest entry of every `is_health` metric per date rather than stored, since an offer is a read over live state. */
export async function currentThresholdOffers(db: PrimaryDatabase, accountId: bigint): Promise<ThresholdOffer[]> {
  const healthMetrics = await db
    .select()
    .from(schema.metrics)
    .where(and(eq(schema.metrics.accountId, accountId), eq(schema.metrics.isHealth, true), eq(schema.metrics.active, true)));

  const offers: ThresholdOffer[] = [];
  for (const metric of healthMetrics) {
    const entries = await db
      .select()
      .from(schema.metricEntries)
      .where(and(eq(schema.metricEntries.accountId, accountId), eq(schema.metricEntries.metricId, metric.id)));
    for (const entry of entries) offers.push(...(await findThresholdOffers(db, accountId, metric, entry)));
  }
  return offers;
}

export function serializeOffer(offer: ThresholdOffer): Record<string, unknown> {
  return {
    questId: String(offer.questId),
    questName: offer.questName,
    metricId: String(offer.metricId),
    date: offer.date,
    thresholdValue: offer.thresholdValue,
    currentValue: offer.currentValue,
    comparison: offer.comparison,
  };
}
