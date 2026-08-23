import { and, eq, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ContinuityOutput } from '../schemas';

export type ContinuityTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

const logger = Logger.getLogger(APP_NAME, 'apply-continuity');

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
        set: {
          location: sql`COALESCE(EXCLUDED.location, character_states.location)`,
          conditions: sql`COALESCE(EXCLUDED.conditions, character_states.conditions)`,
          immediateGoal: sql`COALESCE(EXCLUDED.immediate_goal, character_states.immediate_goal)`,
          statusNote: sql`COALESCE(EXCLUDED.status_note, character_states.status_note)`,
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
