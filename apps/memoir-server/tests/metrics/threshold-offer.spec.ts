import { describe, expect, it } from 'bun:test';

import { currentThresholdOffers, findThresholdOffers, type ThresholdOffer } from '@modules/metrics/threshold-offer';
import { type Metric, type MetricEntry, type PrimaryDatabase, type Quest, type QuestLog } from '@server/database';

import { type RecordedQuery, recordingDb } from '../recording-db';

const ACCOUNT_ID = 99n;
const STEPS = { id: 1n, accountId: ACCOUNT_ID, name: 'Steps', isHealth: true, active: true } as Metric.Row;
const SLEEP = { id: 2n, accountId: ACCOUNT_ID, name: 'Sleep duration', isHealth: true, active: true } as Metric.Row;
const DAYS = 30;

const QUESTS = [
  { id: 10n, name: 'Walk', active: true, healthThreshold: { metricId: '1', value: 8000, comparison: 'gte' } },
  { id: 11n, name: 'Rest', active: true, healthThreshold: { metricId: '2', value: 7, comparison: 'gte' } },
  { id: 12n, name: 'Read', active: true, healthThreshold: null },
  { id: 13n, name: 'Sit less', active: true, healthThreshold: { metricId: '1', value: 2000, comparison: 'lte' } },
] as Quest.Row[];

function dateOf(day: number): string {
  return new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
}

function fixture(): { entries: MetricEntry.Row[]; logs: QuestLog.Row[] } {
  const entries: MetricEntry.Row[] = [];
  const logs: QuestLog.Row[] = [];
  for (let day = 0; day < DAYS; day++) {
    entries.push({ id: BigInt(1000 + day), accountId: ACCOUNT_ID, metricId: STEPS.id, date: dateOf(day), value: String((day * 997) % 12000) } as MetricEntry.Row);
    entries.push({ id: BigInt(5000 + day), accountId: ACCOUNT_ID, metricId: SLEEP.id, date: dateOf(day), value: String(4 + (day % 6)) } as MetricEntry.Row);
    if (day % 3 === 0) logs.push({ accountId: ACCOUNT_ID, questId: 10n, date: dateOf(day) } as QuestLog.Row);
    if (day % 4 === 0) logs.push({ accountId: ACCOUNT_ID, questId: 11n, date: dateOf(day) } as QuestLog.Row);
  }
  return { entries, logs };
}

function expectedOffers(metrics: Metric.Row[], entries: MetricEntry.Row[], logs: QuestLog.Row[]): ThresholdOffer[] {
  const logged = new Set(logs.map(log => `${log.questId}:${log.date}`));
  const offers: ThresholdOffer[] = [];
  for (const metric of metrics) {
    for (const entry of entries.filter(candidate => candidate.metricId === metric.id)) {
      for (const quest of QUESTS) {
        const threshold = quest.healthThreshold as { metricId: string; value: number; comparison: 'gte' | 'lte' } | null;
        if (!threshold || threshold.metricId !== String(metric.id)) continue;
        const value = Number(entry.value);
        if (threshold.comparison === 'gte' ? value < threshold.value : value > threshold.value) continue;
        if (logged.has(`${quest.id}:${entry.date}`)) continue;
        offers.push({
          questId: quest.id,
          questName: quest.name,
          metricId: metric.id,
          date: entry.date,
          thresholdValue: threshold.value,
          currentValue: value,
          comparison: threshold.comparison,
        });
      }
    }
  }
  return offers;
}

function tableOf(query: RecordedQuery): string | undefined {
  return /from "(\w+)"/.exec(query.sql)?.[1];
}

function respondWith(metrics: Metric.Row[], entries: MetricEntry.Row[], logs: QuestLog.Row[]) {
  return (query: RecordedQuery): unknown[] => {
    switch (tableOf(query)) {
      case 'metrics':
        return metrics;
      case 'metric_entries':
        return entries.filter(entry => query.params.includes(entry.metricId));
      case 'quests':
        return QUESTS;
      case 'quest_logs':
        return logs.filter(log => query.params.includes(log.questId) && query.params.includes(log.date));
      default:
        return [];
    }
  };
}

describe('threshold offers', () => {
  it('should serve the full offer set in a fixed four reads however many entries and quests the account holds', async () => {
    const { entries, logs } = fixture();
    const { db, queries } = recordingDb(respondWith([STEPS, SLEEP], entries, logs));

    const offers = await currentThresholdOffers(db as PrimaryDatabase, ACCOUNT_ID);

    expect(offers).toEqual(expectedOffers([STEPS, SLEEP], entries, logs));
    expect(offers.length).toBeGreaterThan(0);
    expect(queries.map(tableOf)).toEqual(['metrics', 'metric_entries', 'quests', 'quest_logs']);
  });

  it('should stop reading once the account has no health metric or no entry', async () => {
    const none = recordingDb(respondWith([], [], []));
    expect(await currentThresholdOffers(none.db as PrimaryDatabase, ACCOUNT_ID)).toEqual([]);
    expect(none.queries).toHaveLength(1);

    const empty = recordingDb(respondWith([STEPS], [], []));
    expect(await currentThresholdOffers(empty.db as PrimaryDatabase, ACCOUNT_ID)).toEqual([]);
    expect(empty.queries).toHaveLength(2);
  });

  it('should offer every crossed quest for a new entry except one already logged that day, in two reads', async () => {
    const entry = { id: 1n, accountId: ACCOUNT_ID, metricId: STEPS.id, date: '2026-03-01', value: '1500' } as MetricEntry.Row;
    const logs = [{ accountId: ACCOUNT_ID, questId: 10n, date: '2026-03-01' } as QuestLog.Row];
    const { db, queries } = recordingDb(respondWith([STEPS], [entry], logs));

    const offers = await findThresholdOffers(db as PrimaryDatabase, ACCOUNT_ID, STEPS, entry);

    expect(offers.map(offer => offer.questId)).toEqual([13n]);
    expect(queries.map(tableOf)).toEqual(['quests', 'quest_logs']);
  });

  it('should not read quest_logs when no threshold is crossed', async () => {
    const entry = { id: 1n, accountId: ACCOUNT_ID, metricId: STEPS.id, date: '2026-03-01', value: '5000' } as MetricEntry.Row;
    const { db, queries } = recordingDb(respondWith([STEPS], [entry], []));

    expect(await findThresholdOffers(db as PrimaryDatabase, ACCOUNT_ID, STEPS, entry)).toEqual([]);
    expect(queries.map(tableOf)).toEqual(['quests']);
  });
});
