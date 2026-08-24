import { AppError } from '@shadow-library/common';

import { type PrimaryDatabase, type Quest, type QuestLog, schema, type Subscription } from '@server/database';

/**
 * One row in every user-owned table the export registry (`export-table-registry.ts`) enumerates, for the
 * "a fully-seeded account's export contains every entity class" accept criteria (ARCHITECTURE §20,
 * T-29). Field values that the completeness/content tests assert on verbatim are named distinctly per
 * table (`questName`, `reasonNote`, `journalText`, ...) rather than a shared placeholder, so a table
 * whose export silently dropped a column reads as a specific assertion failure, not a coincidental match.
 */
export async function seedFullAccount(db: PrimaryDatabase, accountId: bigint): Promise<{ quest: Quest.Row; questLog: QuestLog.Row; subscription: Subscription.Row }> {
  const today = '2026-08-24';

  const [quest] = await db
    .insert(schema.quests)
    .values({
      accountId,
      name: 'Sensitive Quest Name',
      notes: 'quest notes',
      startTimeMin: 480,
      durationMin: 30,
      statAffinity: 'discipline',
      strictness: 'anchor',
      recurrence: { freq: 'daily' },
    })
    .returning();
  if (!quest) throw AppError.internal('quest seed failed');

  const [metric] = await db.insert(schema.metrics).values({ accountId, name: 'Steps', valueType: 'number', direction: 'higher' }).returning();
  if (!metric) throw AppError.internal('metric seed failed');

  await db.insert(schema.questConsequences).values({ accountId, questId: quest.id, metricId: metric.id, fullValue: '10', partialMode: 'actual' });

  const [questLog] = await db
    .insert(schema.questLogs)
    .values({
      accountId,
      questId: quest.id,
      date: today,
      state: 'completed',
      statAffinity: 'discipline',
      strictness: 'anchor',
      intensityModeAtLog: 'standard',
      crownSliceWeight: '1.00',
      rulesetVersion: 1,
      reasonNote: 'a most-sensitive reason note',
      reflectionText: 'a most-sensitive reflection',
    })
    .returning();
  if (!questLog) throw AppError.internal('quest log seed failed');

  await db.insert(schema.heroEvents).values({
    accountId,
    dedupeKey: `export-fixture-${accountId}`,
    type: 'quest_complete',
    questId: quest.id,
    questLogId: questLog.id,
    xpDelta: 10,
    coinsDelta: 5,
    date: today,
    note: 'a hero event note',
    rulesetVersion: 1,
  });

  await db
    .insert(schema.dailyStates)
    .values({ accountId, date: today, intensityMode: 'standard', hpStart: 100, hpEnd: 100, hpMax: 100, crownPeriodStart: today, rulesetVersion: 1 });

  await db.insert(schema.rescheduleEvents).values({ accountId, questId: quest.id, date: today, toMin: 600, reasonNote: 'reschedule reason note' });

  await db
    .insert(schema.recoveryQuests)
    .values({ accountId, date: today, sourceQuestId: quest.id, sourceQuestName: quest.name, reflectionText: 'recovery reflection', expiresAt: new Date() });

  await db.insert(schema.comebackEvents).values({ accountId, date: today, kind: 'armed', intensityMode: 'standard' });

  await db.insert(schema.returnerEvents).values({ accountId, date: today, returnDate: today, daysAbsent: 3, intensityMode: 'standard' });

  await db.insert(schema.shieldConsumptions).values({ accountId, questId: quest.id, date: today });

  await db.insert(schema.achievementsEarned).values({ accountId, achievementId: 'first-step' });
  await db.insert(schema.titlesEarned).values({ accountId, titleId: 'the-disciplined' });
  await db.insert(schema.cosmeticUnlocks).values({ accountId, cosmeticId: 'gold-frame', kind: 'frame', source: 'coin' });

  await db.insert(schema.questStreaks).values({ accountId, questId: quest.id, currentRunDays: 3, bestRunDays: 5 });

  const [category] = await db.insert(schema.expenseCategories).values({ accountId, key: 'food', label: 'Food' }).returning();
  if (!category) throw AppError.internal('category seed failed');

  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      accountId,
      name: 'Streaming',
      amountMinor: 1000n,
      amountText: '10.00',
      currency: 'USD',
      frequency: 'monthly',
      billingDay: 1,
      nextDueDate: today,
      categoryId: category.key,
      monthlyEquivalentMinor: 1000n,
    })
    .returning();
  if (!subscription) throw AppError.internal('subscription seed failed');

  await db.insert(schema.expenses).values({
    id: Bun.randomUUIDv7(),
    accountId,
    amountMinor: 500n,
    amountText: '5.00',
    currency: 'USD',
    categoryId: category.key,
    merchant: 'a sensitive merchant name',
    note: 'a sensitive expense note',
    occurredOn: today,
  });

  await db.insert(schema.metricEntries).values({ accountId, metricId: metric.id, date: today, value: '1234', source: 'manual' });

  await db.insert(schema.progressCounters).values({ accountId, counters: { firstQuestCompletions: 1 } });

  await db.insert(schema.journalEntries).values({ id: Bun.randomUUIDv7(), accountId, date: today, text: 'a most-sensitive journal entry', mood: 3 });

  const [mealPreset] = await db.insert(schema.mealPresets).values({ accountId, name: 'a sensitive preset name', calories: 400, mealType: 'cooked' }).returning();
  if (!mealPreset) throw AppError.internal('meal preset seed failed');

  await db
    .insert(schema.meals)
    .values({ id: Bun.randomUUIDv7(), accountId, date: today, name: 'a sensitive meal name', calories: 400, mealType: 'cooked', presetId: mealPreset.id });

  await db.insert(schema.weights).values({ accountId, date: today, kg: '70.50' });

  await db.insert(schema.sideQuests).values({ id: Bun.randomUUIDv7(), accountId, date: today, name: 'a sensitive side quest name' });

  await db.insert(schema.entitlements).values({ accountId, tier: 'paid', state: 'active' });

  await db
    .insert(schema.billingEvents)
    .values({ accountId, provider: 'generic-hmac', providerEventId: `export-fixture-${accountId}`, type: 'subscription.active', occurredAt: new Date() });

  await db.insert(schema.receipts).values({ ref: `r/${accountId}/export-fixture.jpg`, accountId, contentType: 'image/jpeg', sizeBytes: 100, status: 'stored' });

  await db.insert(schema.devices).values({ id: Bun.randomUUIDv7(), accountId, userAgent: 'export-fixture-device' });

  return { quest, questLog, subscription };
}
