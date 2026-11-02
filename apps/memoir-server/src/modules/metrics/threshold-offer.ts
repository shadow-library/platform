import { and, eq, inArray } from 'drizzle-orm';

import { type SqlExecutor } from '@modules/auth';
import { type Metric, type MetricEntry, type PrimaryDatabase, type Quest, schema } from '@server/database';

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

function crossedOffers(quests: Quest.Row[], metric: Metric.Row, entry: MetricEntry.Row): ThresholdOffer[] {
  const offers: ThresholdOffer[] = [];
  for (const quest of quests) {
    const threshold = parseHealthThreshold(quest.healthThreshold);
    if (!threshold || threshold.metricId !== String(metric.id)) continue;
    if (!crossed(threshold, Number(entry.value))) continue;
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

function activeQuests(executor: SqlExecutor, accountId: bigint): Promise<Quest.Row[]> {
  return executor
    .select()
    .from(schema.quests)
    .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.active, true)));
}

/** One `quest_logs` read for every candidate rather than one per candidate: the IN-lists select a superset of the (quest, date) pairs, narrowed to exact pairs here. */
async function withoutLoggedOccurrences(executor: SqlExecutor, accountId: bigint, candidates: ThresholdOffer[]): Promise<ThresholdOffer[]> {
  if (candidates.length === 0) return candidates;
  const questIds = [...new Set(candidates.map(offer => offer.questId))];
  const dates = [...new Set(candidates.map(offer => offer.date))];
  const logged = await executor
    .select({ questId: schema.questLogs.questId, date: schema.questLogs.date })
    .from(schema.questLogs)
    .where(and(eq(schema.questLogs.accountId, accountId), inArray(schema.questLogs.questId, questIds), inArray(schema.questLogs.date, dates)));
  const occupied = new Set(logged.map(log => `${log.questId}:${log.date}`));
  return candidates.filter(offer => !occupied.has(`${offer.questId}:${offer.date}`));
}

/**
 * Scans the account's active quests for a `health_threshold` naming this metric and surfaces an offer only where the threshold is crossed and
 * no `quest_logs` row exists for (quest, date).
 * Never writes; the client's own `CompleteQuest` is what grants the reward.
 */
export async function findThresholdOffers(executor: SqlExecutor, accountId: bigint, metric: Metric.Row, entry: MetricEntry.Row): Promise<ThresholdOffer[]> {
  const quests = await activeQuests(executor, accountId);
  return withoutLoggedOccurrences(executor, accountId, crossedOffers(quests, metric, entry));
}

/** The full current offer set, recomputed live from the latest entry of every `is_health` metric per date rather than stored, since an offer is a read over live state. */
export async function currentThresholdOffers(db: PrimaryDatabase, accountId: bigint): Promise<ThresholdOffer[]> {
  const healthMetrics = await db
    .select()
    .from(schema.metrics)
    .where(and(eq(schema.metrics.accountId, accountId), eq(schema.metrics.isHealth, true), eq(schema.metrics.active, true)));
  if (healthMetrics.length === 0) return [];

  const entries = await db
    .select()
    .from(schema.metricEntries)
    .where(
      and(
        eq(schema.metricEntries.accountId, accountId),
        inArray(
          schema.metricEntries.metricId,
          healthMetrics.map(metric => metric.id),
        ),
      ),
    );
  if (entries.length === 0) return [];

  const quests = await activeQuests(db, accountId);
  const candidates = healthMetrics.flatMap(metric => entries.filter(entry => entry.metricId === metric.id).flatMap(entry => crossedOffers(quests, metric, entry)));
  return withoutLoggedOccurrences(db, accountId, candidates);
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
