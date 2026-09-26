import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
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

interface CharacterEventInput {
  entityId: bigint;
  chapter: number;
  kind: schema.Knowledge.CharacterEventKind;
  detailKey?: string;
  before: unknown;
  after: unknown;
}

// History `character_states`/`entity_appearances`/`entity_relationships` don't keep themselves. A retried
// continuity apply for the same (entity, chapter, kind, detailKey) updates `after` in place rather than
// duplicating the row; `before` is written once and kept, since it is what a *later* re-extraction would
// otherwise clobber with a value that isn't actually "before" anymore.
async function recordCharacterEvent(tx: ContinuityTransaction, projectId: bigint, event: CharacterEventInput): Promise<void> {
  const detailKey = event.detailKey ?? '';
  await tx
    .insert(schema.characterEvents)
    .values({
      projectId,
      entityId: event.entityId,
      chapter: event.chapter,
      kind: event.kind,
      detailKey,
      before: event.before as never,
      after: event.after as never,
      source: 'continuity',
      status: 'committed',
    })
    .onConflictDoUpdate({
      target: [schema.characterEvents.projectId, schema.characterEvents.entityId, schema.characterEvents.chapter, schema.characterEvents.kind, schema.characterEvents.detailKey],
      set: { after: sql`EXCLUDED.after`, source: 'continuity' },
    });
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
    const [appearance] = await tx
      .insert(schema.entityAppearances)
      .values({ entityId, projectId, chapter, firstChapter: chapter, lastChapter: chapter })
      .onConflictDoNothing()
      .returning();
    if (appearance) {
      // No `after` payload: `firstChapter`/`lastChapter` are chapter numbers a chapter insert's shift pass can't
      // see inside jsonb, and `seenChapters` is never set on this insert — the event's own chapter says it all.
      await recordCharacterEvent(tx, projectId, { entityId, chapter, kind: 'appearance', before: null, after: null });
    }
  }

  for (const thread of delta.threads ?? []) {
    if (thread.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence thread skipped for review', { projectId, chapter, threadKey: thread.threadKey });
      continue;
    }
    const threadWhere = and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.threadKey, thread.threadKey));
    // Serialises with a concurrent promise.drop or set_payoff, which would otherwise be overwritten by this read's stale status.
    await tx.select({ id: schema.plotThreads.id }).from(schema.plotThreads).where(threadWhere).for('update');
    // An approved-late proposal from an older chapter must not drag a thread back to the status it had then.
    const existingThread = await tx.query.plotThreads.findFirst({
      where: threadWhere,
      columns: { lastAdvancedChapter: true, status: true, closedChapter: true, intentionallyOpen: true },
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
    // A dropped thread and a dormant-on-purpose one are the author's own calls (promise.drop, promise.set_payoff) — continuity
    // extraction never reopens or un-silences one.
    const dropped = existingThread?.status === 'dropped';
    const status = dropped ? existingThread.status : thread.status;
    const closedChapter = dropped ? existingThread.closedChapter : thread.status === 'closed' ? chapter : (existingThread?.closedChapter ?? null);
    const intentionallyOpen = existingThread ? existingThread.intentionallyOpen : (thread.intentionallyOpen ?? false);

    await tx
      .insert(schema.plotThreads)
      .values({
        projectId,
        threadKey: thread.threadKey,
        status,
        openedChapter: chapter,
        closedChapter,
        summary: thread.summary ?? null,
        intentionallyOpen,
        lastAdvancedChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.plotThreads.projectId, schema.plotThreads.threadKey],
        set: { status, closedChapter, summary: sql`COALESCE(EXCLUDED.summary, plot_threads.summary)`, intentionallyOpen, lastAdvancedChapter: chapter, updatedAt: new Date() },
      });
  }

  for (const mystery of delta.mysteries ?? []) {
    if (mystery.confidence === 'low') {
      logger.warn('applyContinuityDelta: low-confidence mystery skipped for review', { projectId, chapter, mysteryKey: mystery.mysteryKey });
      continue;
    }
    const mysteryWhere = and(eq(schema.mysteries.projectId, projectId), eq(schema.mysteries.mysteryKey, mystery.mysteryKey));
    await tx.select({ id: schema.mysteries.id }).from(schema.mysteries).where(mysteryWhere).for('update');
    const existingMystery = await tx.query.mysteries.findFirst({
      where: mysteryWhere,
      columns: { lastAdvancedChapter: true, status: true, resolvedChapter: true, intentionallyOpen: true },
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
    // See the plot-threads block above: a dropped mystery and a dormant-on-purpose one are the author's own calls, never undone by extraction.
    const mysteryDropped = existingMystery?.status === 'dropped';
    const mysteryStatus = mysteryDropped ? existingMystery.status : mystery.status;
    const resolvedChapter = mysteryDropped ? existingMystery.resolvedChapter : mystery.status === 'resolved' ? chapter : (existingMystery?.resolvedChapter ?? null);
    const mysteryIntentionallyOpen = existingMystery ? existingMystery.intentionallyOpen : (mystery.intentionallyOpen ?? false);

    await tx
      .insert(schema.mysteries)
      .values({
        projectId,
        mysteryKey: mystery.mysteryKey,
        status: mysteryStatus,
        question: mystery.question ?? '',
        openedChapter: chapter,
        resolvedChapter,
        intentionallyOpen: mysteryIntentionallyOpen,
        truthFactKey: mystery.truthFactKey ?? null,
        lastAdvancedChapter: chapter,
      })
      .onConflictDoUpdate({
        target: [schema.mysteries.projectId, schema.mysteries.mysteryKey],
        set: {
          status: mysteryStatus,
          resolvedChapter,
          question: sql`COALESCE(NULLIF(EXCLUDED.question, ''), mysteries.question)`,
          intentionallyOpen: mysteryIntentionallyOpen,
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
    // The relationship's own row for this chapter doesn't exist yet on a first pass, so "before" is read from
    // the most recent earlier chapter that recorded this (entity, target, kind) — or an undated (`chapter` null)
    // row, for one seeded before this table tracked chapters.
    const existingRelationship = await tx.query.entityRelationships.findFirst({
      where: and(
        eq(schema.entityRelationships.projectId, projectId),
        eq(schema.entityRelationships.entityId, entityId),
        eq(schema.entityRelationships.targetKey, relationship.targetKey),
        eq(schema.entityRelationships.kind, relationship.kind),
        or(isNull(schema.entityRelationships.chapter), lt(schema.entityRelationships.chapter, chapter)),
      ),
      columns: { note: true },
      orderBy: [sql`${schema.entityRelationships.chapter} desc nulls last`],
    });
    const [savedRelationship] = await tx
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
      })
      .returning();
    if (savedRelationship) {
      await recordCharacterEvent(tx, projectId, {
        entityId,
        chapter,
        kind: 'relationship',
        detailKey: `${relationship.targetKey}:${relationship.kind}`,
        before: existingRelationship ? { targetKey: relationship.targetKey, kind: relationship.kind, note: existingRelationship.note } : null,
        after: { targetKey: relationship.targetKey, kind: relationship.kind, note: savedRelationship.note },
      });
    }
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
    // FOR UPDATE only serialises once the row exists — a concurrent first insert for this entity can still race.
    const [existingState] = await tx
      .select({
        lastUpdatedChapter: schema.characterStates.lastUpdatedChapter,
        location: schema.characterStates.location,
        conditions: schema.characterStates.conditions,
        immediateGoal: schema.characterStates.immediateGoal,
        statusNote: schema.characterStates.statusNote,
      })
      .from(schema.characterStates)
      .where(and(eq(schema.characterStates.projectId, projectId), eq(schema.characterStates.entityKey, characterState.entityKey)))
      .for('update');
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

    const after = {
      location: characterState.location ?? null,
      conditions: characterState.conditions ?? null,
      immediateGoal: characterState.immediateGoal ?? null,
      statusNote: characterState.statusNote ?? null,
    };
    const before = existingState
      ? { location: existingState.location, conditions: existingState.conditions, immediateGoal: existingState.immediateGoal, statusNote: existingState.statusNote }
      : null;
    await recordCharacterEvent(tx, projectId, { entityId, chapter, kind: 'state', before, after });
  }

  // `delta.knowledgeChanges` is deliberately not written to `character_knowledge`: that ledger is populated
  // only deterministically from brief `learns` declarations at draft approval, never by AI extraction
  // — it is what the leak scanner and the judge's forbidden-knowledge gate trust to decide what a character may safely reference,
  // so a hallucinated reveal would silently mark a still-hidden fact as known. The raw delta stays visible on the continuity proposal
  // for a human to act on via the manual fact-reveal endpoint. `delta.timeline` and `delta.power` are likewise not persisted.
  // Entries the model marked `confidence: 'low'` follow the same route — skipped here, still on the proposal for a human to edit
  // and re-apply. An absent `confidence` means auto-apply, so a model that never emits the field behaves exactly as before.
}
