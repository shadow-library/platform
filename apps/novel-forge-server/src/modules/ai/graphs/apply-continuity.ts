import { and, eq, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ContinuityOutput } from '../schemas';

export type ContinuityTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

const logger = Logger.getLogger(APP_NAME, 'apply-continuity');

export function continuityHasHeldEntries(delta: ContinuityOutput): boolean {
  const confidenceBearing = [...(delta.threads ?? []), ...(delta.mysteries ?? []), ...(delta.relationships ?? []), ...(delta.characterStates ?? [])];
  return confidenceBearing.some(entry => entry.confidence === 'low');
}

// What a review approval may re-apply is only what was never applied: `newEntities`/`appeared` were durably
// written on the original pass and `timeline`/`power`/`knowledgeChanges` are deliberately never persisted, so
// replaying any of them can only overwrite canon a later chapter has since advanced. Only the four
// confidence-bearing arrays can still hold unapplied entries, and only their `'low'` members are still pending.
export function filterToHeldEntries(delta: ContinuityOutput): ContinuityOutput {
  return {
    appeared: [],
    newEntities: [],
    timeline: [],
    power: [],
    knowledgeChanges: [],
    chapterSummary: delta.chapterSummary,
    threads: (delta.threads ?? []).filter(thread => thread.confidence === 'low'),
    mysteries: (delta.mysteries ?? []).filter(mystery => mystery.confidence === 'low'),
    relationships: (delta.relationships ?? []).filter(relationship => relationship.confidence === 'low'),
    characterStates: (delta.characterStates ?? []).filter(characterState => characterState.confidence === 'low'),
  };
}

export async function applyContinuityDelta(tx: ContinuityTransaction, projectId: bigint, chapter: number, delta: ContinuityOutput): Promise<void> {
  const entityIds = new Map<string, bigint>();

  async function resolveEntityId(entityKey: string): Promise<bigint | null> {
    const cached = entityIds.get(entityKey);
    if (cached !== undefined) return cached;
    const entity = await tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) });
    if (!entity) return null;
    entityIds.set(entityKey, entity.id);
    return entity.id;
  }

  for (const newEntity of delta.newEntities ?? []) {
    const [entity] = await tx
      .insert(schema.entities)
      .values({
        projectId,
        entityKey: newEntity.entityKey,
        name: newEntity.name,
        type: newEntity.type,
        notes: newEntity.notes ?? null,
        origin: 'generated',
        status: 'active',
        firstSeenChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.entities.projectId, schema.entities.entityKey],
        set: { name: sql`COALESCE(EXCLUDED.name, entities.name)`, updatedAt: new Date() },
      })
      .returning();
    if (entity) entityIds.set(newEntity.entityKey, entity.id);
  }

  const appearedKeys = new Set([...(delta.appeared ?? []), ...(delta.newEntities ?? []).map(e => e.entityKey)]);
  for (const entityKey of appearedKeys) {
    const entityId = await resolveEntityId(entityKey);
    if (!entityId) {
      logger.warn('applyContinuityDelta: appeared entity not found, skipping', { projectId, chapter, entityKey });
      continue;
    }
    await tx.insert(schema.entityAppearances).values({ entityId, projectId, chapter, firstChapter: chapter, lastChapter: chapter }).onConflictDoNothing();
  }

  for (const thread of delta.threads ?? []) {
    if (thread.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence thread skipped for review', { projectId, chapter, threadKey: thread.threadKey });
      continue;
    }
    // An approved-late proposal from an older chapter must not drag a thread back to the status it had then.
    const existingThread = await tx.query.plotThreads.findFirst({
      where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.threadKey, thread.threadKey)),
      columns: { lastAdvancedChapter: true },
    });
    if (existingThread?.lastAdvancedChapter != null && existingThread.lastAdvancedChapter > chapter) {
      logger.warn('applyContinuityDelta: thread already advanced past this chapter, skipping', {
        projectId,
        chapter,
        threadKey: thread.threadKey,
        lastAdvancedChapter: existingThread.lastAdvancedChapter,
      });
      continue;
    }
    await tx
      .insert(schema.plotThreads)
      .values({
        projectId,
        threadKey: thread.threadKey,
        status: thread.status,
        openedChapter: chapter,
        closedChapter: thread.status === 'closed' ? chapter : null,
        summary: thread.summary ?? null,
        intentionallyOpen: thread.intentionallyOpen ?? false,
        lastAdvancedChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
        set: {
          status: sql`EXCLUDED.status`,
          closedChapter: thread.status === 'closed' ? chapter : sql`plot_threads.closed_chapter`,
          summary: sql`COALESCE(EXCLUDED.summary, plot_threads.summary)`,
          intentionallyOpen: sql`EXCLUDED.intentionally_open`,
          lastAdvancedChapter: chapter,
          updatedAt: new Date(),
        },
      });
  }

  for (const mystery of delta.mysteries ?? []) {
    if (mystery.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence mystery skipped for review', { projectId, chapter, mysteryKey: mystery.mysteryKey });
      continue;
    }
    const existingMystery = await tx.query.mysteries.findFirst({
      where: and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.mysteryKey, mystery.mysteryKey)),
      columns: { lastAdvancedChapter: true },
    });
    if (existingMystery?.lastAdvancedChapter != null && existingMystery.lastAdvancedChapter > chapter) {
      logger.warn('applyContinuityDelta: mystery already advanced past this chapter, skipping', {
        projectId,
        chapter,
        mysteryKey: mystery.mysteryKey,
        lastAdvancedChapter: existingMystery.lastAdvancedChapter,
      });
      continue;
    }
    await tx
      .insert(schema.mysteries)
      .values({
        projectId,
        mysteryKey: mystery.mysteryKey,
        status: mystery.status,
        question: mystery.question ?? '',
        openedChapter: chapter,
        resolvedChapter: mystery.status === 'resolved' ? chapter : null,
        intentionallyOpen: mystery.intentionallyOpen ?? false,
        truthFactKey: mystery.truthFactKey ?? null,
        lastAdvancedChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
        set: {
          status: sql`EXCLUDED.status`,
          resolvedChapter: mystery.status === 'resolved' ? chapter : sql`mysteries.resolved_chapter`,
          question: sql`COALESCE(NULLIF(EXCLUDED.question, ''), mysteries.question)`,
          intentionallyOpen: sql`EXCLUDED.intentionally_open`,
          truthFactKey: sql`COALESCE(EXCLUDED.truth_fact_key, mysteries.truth_fact_key)`,
          lastAdvancedChapter: chapter,
          updatedAt: new Date(),
        },
      });
  }

  for (const relationship of delta.relationships ?? []) {
    if (relationship.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence relationship skipped for review', {
        projectId,
        chapter,
        entityKey: relationship.entityKey,
        targetKey: relationship.targetKey,
      });
      continue;
    }
    const entityId = await resolveEntityId(relationship.entityKey);
    if (!entityId) {
      logger.warn('applyContinuityDelta: relationship source entity not found, skipping', { projectId, chapter, entityKey: relationship.entityKey });
      continue;
    }
    // `entity_relationships.target_key` is a plain varchar, so an unresolvable target would otherwise
    // become a permanent edge pointing at a character that does not exist.
    const targetId = await resolveEntityId(relationship.targetKey);
    if (!targetId) {
      logger.warn('applyContinuityDelta: relationship target entity not found, skipping', { projectId, chapter, targetKey: relationship.targetKey });
      continue;
    }
    await tx
      .insert(schema.entityRelationships)
      .values({ projectId, entityId, targetKey: relationship.targetKey, kind: relationship.kind, note: relationship.note ?? null, chapter })
      .onConflictDoUpdate({
        target: [
          schema.entityRelationships.projectId,
          schema.entityRelationships.entityId,
          schema.entityRelationships.targetKey,
          schema.entityRelationships.kind,
          schema.entityRelationships.chapter,
        ],
        set: { note: sql`COALESCE(EXCLUDED.note, entity_relationships.note)` },
      });
  }

  for (const characterState of delta.characterStates ?? []) {
    if (characterState.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence character state skipped for review', { projectId, chapter, entityKey: characterState.entityKey });
      continue;
    }
    // `character_states.entity_key` is a plain varchar, so an extracted key that names no entity would
    // otherwise become a permanent orphan row that never resolves back to a character.
    const entityId = await resolveEntityId(characterState.entityKey);
    if (!entityId) {
      logger.warn('applyContinuityDelta: character state entity not found, skipping', { projectId, chapter, entityKey: characterState.entityKey });
      continue;
    }
    const existingState = await tx.query.characterStates.findFirst({
      where: and(eq(schema.characterStates.projectId, projectId), eq(schema.characterStates.entityKey, characterState.entityKey)),
      columns: { lastUpdatedChapter: true },
    });
    if (existingState?.lastUpdatedChapter != null && existingState.lastUpdatedChapter > chapter) {
      logger.warn('applyContinuityDelta: character state already updated past this chapter, skipping', {
        projectId,
        chapter,
        entityKey: characterState.entityKey,
        lastUpdatedChapter: existingState.lastUpdatedChapter,
      });
      continue;
    }
    await tx
      .insert(schema.characterStates)
      .values({
        projectId,
        entityKey: characterState.entityKey,
        location: characterState.location ?? null,
        conditions: characterState.conditions ?? null,
        immediateGoal: characterState.immediateGoal ?? null,
        statusNote: characterState.statusNote ?? null,
        lastUpdatedChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.characterStates.projectId, schema.characterStates.entityKey],
        // The continuity prompt contracts each reported state as a full replacement snapshot ("state only what is now true"),
        // so an omitted field means the old value stopped being true — COALESCE here would resurrect healed injuries as current.
        set: {
          location: characterState.location ?? null,
          conditions: characterState.conditions ?? null,
          immediateGoal: characterState.immediateGoal ?? null,
          statusNote: characterState.statusNote ?? null,
          lastUpdatedChapter: chapter,
          updatedAt: new Date(),
        },
      });
  }

  // `delta.knowledgeChanges` is deliberately not written to `character_knowledge`: that ledger is populated
  // only deterministically from brief `learns` declarations at draft approval, never by AI extraction
  // (character-knowledge design §4) — it is what the leak scanner and the judge's forbidden-knowledge gate
  // trust to decide what a character may safely reference, so a hallucinated reveal would silently mark a
  // still-hidden fact as known. The raw delta stays visible on the continuity proposal for a human to act on
  // via the manual fact-reveal endpoint. `delta.timeline` and `delta.power` are likewise not persisted
  // (recommendation §6). Entries the model marked `confidence: 'low'` follow the same route — skipped here,
  // still on the proposal for a human to edit and re-apply. An absent `confidence` means auto-apply, so a
  // model that never emits the field behaves exactly as before.
}
