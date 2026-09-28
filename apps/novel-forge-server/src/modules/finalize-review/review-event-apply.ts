import { and, eq, getTableColumns, ne, type SQL, sql } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';

import { AppErrorCode } from '@server/classes';
import { type FinalizeReview, type FinalizeReviewAppliedItem, type FinalizeReviewRowChange, type PrimaryTransaction, schema } from '@server/database';

import { applyContinuityDelta } from '../ai/graphs/apply-continuity';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
import { canonicalJson, effectiveChange, type ProposedChange } from './finalize-review-items';

type StoredRow = Record<string, unknown>;

export interface RowRef {
  table: keyof typeof TABLES;
  match: Record<string, string | number>;
}

/** Reads and restores single rows by their unique key, in the form a review stores them. */
export interface RowStore {
  read(ref: RowRef): Promise<StoredRow | null>;
  write(ref: RowRef, row: StoredRow | null): Promise<void>;
  /** Whether any row still points at an entity, by id or as a relationship's target; deleting it would cascade or strand them. */
  entityReferenced(entity: StoredRow): Promise<boolean>;
}

export interface ApplyTarget {
  projectId: bigint;
  chapter: number;
  draftRevision: number;
}

export type KeptItem = Pick<FinalizeReview.Item, 'id' | 'proposed' | 'edited' | 'decision'>;

const TABLES = {
  entities: schema.entities,
  entity_appearances: schema.entityAppearances,
  entity_relationships: schema.entityRelationships,
  character_states: schema.characterStates,
  character_events: schema.characterEvents,
  plot_threads: schema.plotThreads,
  mysteries: schema.mysteries,
  character_knowledge: schema.characterKnowledge,
  milestones: schema.milestones,
} satisfies Record<string, PgTable>;

const EMPTY_DELTA: ContinuityOutput = {
  appeared: [],
  newEntities: [],
  threads: [],
  mysteries: [],
  timeline: [],
  relationships: [],
  power: [],
  characterStates: [],
  knowledgeChanges: [],
  chapterSummary: '',
};

function columnsOf(table: RowRef['table']): Record<string, PgColumn> {
  return getTableColumns(TABLES[table]) as Record<string, PgColumn>;
}

function toStored(row: Record<string, unknown>): StoredRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value]));
}

function fromStored(table: RowRef['table'], row: StoredRow): Record<string, unknown> {
  const columns = columnsOf(table);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const type = columns[key]?.columnType;
      if (value === null || value === undefined) return [key, value];
      if (type === 'PgBigInt64' || type === 'PgBigSerial64') return [key, BigInt(value as string)];
      if (type === 'PgTimestamp') return [key, new Date(value as string)];
      return [key, value];
    }),
  );
}

function sameRow(left: StoredRow | null, right: StoredRow | null): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

const ENTITY_REFERENCES: PgTable[] = [
  schema.entityImages,
  schema.entityAliases,
  schema.entityRelationships,
  schema.entityAppearances,
  schema.characterKnowledge,
  schema.characterEvents,
];

export function drizzleRowStore(tx: PrimaryTransaction): RowStore {
  const whereOf = (ref: RowRef): SQL => {
    const columns = columnsOf(ref.table);
    const match = fromStored(ref.table, ref.match);
    return and(...Object.entries(match).map(([key, value]) => eq(columns[key] as PgColumn, value))) as SQL;
  };
  const read = async (ref: RowRef): Promise<StoredRow | null> => {
    const [row] = await tx.select().from(TABLES[ref.table]).where(whereOf(ref)).for('update');
    return row ? toStored(row as Record<string, unknown>) : null;
  };
  return {
    read,
    async write(ref, row) {
      const table = TABLES[ref.table];
      if (row === null) return void (await tx.delete(table).where(whereOf(ref)));
      const values = fromStored(ref.table, row);
      if (await read(ref)) {
        const { id: _id, ...set } = values;
        return void (await tx.update(table).set(set).where(whereOf(ref)));
      }
      await tx.insert(table).values(values as never);
    },
    async entityReferenced(entity) {
      const id = BigInt(entity['id'] as string);
      const exists = (table: PgTable, condition: SQL) =>
        tx
          .select({ one: sql`1` })
          .from(table)
          .where(condition)
          .limit(1);
      const byId = ENTITY_REFERENCES.map(table => exists(table, eq((getTableColumns(table) as Record<string, PgColumn>)['entityId'] as PgColumn, id)));
      // Relationship edges name their target by key, with no foreign key to cascade or refuse: deleting the entity would leave them dangling.
      const asTarget = exists(
        schema.entityRelationships,
        and(eq(schema.entityRelationships.projectId, BigInt(entity['projectId'] as string)), eq(schema.entityRelationships.targetKey, entity['entityKey'] as string)) as SQL,
      );
      for (const query of [...byId, asTarget]) if ((await query).length > 0) return true;
      return false;
    },
  };
}

async function entityId(tx: PrimaryTransaction, projectId: bigint, entityKey: string): Promise<bigint | null> {
  const entity = await tx.query.entities.findFirst({ columns: { id: true }, where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) });
  return entity?.id ?? null;
}

function eventRef(target: ApplyTarget, id: bigint, kind: string, detailKey = ''): RowRef {
  return { table: 'character_events', match: { projectId: String(target.projectId), entityId: String(id), chapter: target.chapter, kind, detailKey } };
}

/** The rows one change can touch, keyed by what exists right now: an entity created by the change only yields its dependent rows after it. */
export async function rowsTouchedBy(tx: PrimaryTransaction, target: ApplyTarget, change: ProposedChange): Promise<RowRef[]> {
  const project = String(target.projectId);
  const appearance = (id: bigint): RowRef[] => [{ table: 'entity_appearances', match: { entityId: String(id), chapter: target.chapter } }, eventRef(target, id, 'appearance')];
  switch (change.category) {
    case 'entity': {
      const id = await entityId(tx, target.projectId, change.entity.entityKey);
      return [{ table: 'entities', match: { projectId: project, entityKey: change.entity.entityKey } }, ...(id ? appearance(id) : [])];
    }
    case 'appearance': {
      const id = await entityId(tx, target.projectId, change.entityKey);
      return id ? appearance(id) : [];
    }
    case 'character_state': {
      const id = await entityId(tx, target.projectId, change.state.entityKey);
      return [{ table: 'character_states', match: { projectId: project, entityKey: change.state.entityKey } }, ...(id ? [eventRef(target, id, 'state')] : [])];
    }
    case 'relationship': {
      const { entityKey, targetKey, kind } = change.relationship;
      const id = await entityId(tx, target.projectId, entityKey);
      if (!id) return [];
      return [
        { table: 'entity_relationships', match: { projectId: project, entityId: String(id), targetKey, kind, chapter: target.chapter } },
        eventRef(target, id, 'relationship', `${targetKey}:${kind}`),
      ];
    }
    case 'promise':
      return 'thread' in change
        ? [{ table: 'plot_threads', match: { projectId: project, threadKey: change.thread.threadKey } }]
        : [{ table: 'mysteries', match: { projectId: project, mysteryKey: change.mystery.mysteryKey } }];
    case 'knowledge': {
      const id = await entityId(tx, target.projectId, change.entityKey);
      const fact = await tx.query.canonFacts.findFirst({
        columns: { id: true },
        where: and(eq(schema.canonFacts.projectId, target.projectId), eq(schema.canonFacts.factKey, change.factKey)),
      });
      return id && fact ? [{ table: 'character_knowledge', match: { factId: String(fact.id), entityId: String(id) } }] : [];
    }
    case 'milestone':
      return [{ table: 'milestones', match: { projectId: project, milestoneKey: change.milestoneKey } }];
    case 'summary':
      return [];
  }
}

/** Writes one kept change the way continuity always has — same guards against dropped promises and later chapters — plus the two categories only a review can confirm. */
export async function applyChange(tx: PrimaryTransaction, target: ApplyTarget, change: ProposedChange): Promise<void> {
  const { projectId, chapter } = target;
  switch (change.category) {
    case 'entity':
      return applyContinuityDelta(tx, projectId, chapter, { ...EMPTY_DELTA, newEntities: [change.entity] });
    case 'appearance':
      return applyContinuityDelta(tx, projectId, chapter, { ...EMPTY_DELTA, appeared: [change.entityKey] });
    case 'character_state':
      return applyContinuityDelta(tx, projectId, chapter, { ...EMPTY_DELTA, characterStates: [change.state] });
    case 'relationship':
      return applyContinuityDelta(tx, projectId, chapter, { ...EMPTY_DELTA, relationships: [change.relationship] });
    case 'promise':
      return applyContinuityDelta(tx, projectId, chapter, 'thread' in change ? { ...EMPTY_DELTA, threads: [change.thread] } : { ...EMPTY_DELTA, mysteries: [change.mystery] });
    case 'knowledge': {
      const id = await entityId(tx, projectId, change.entityKey);
      const fact = await tx.query.canonFacts.findFirst({
        columns: { id: true },
        where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, change.factKey)),
      });
      if (!id || !fact) return;
      await tx
        .insert(schema.characterKnowledge)
        .values({ projectId, factId: fact.id, entityId: id, learnedInChapter: chapter, source: 'generated', note: change.how, status: 'committed' })
        .onConflictDoNothing();
      return;
    }
    case 'milestone':
      if (!change.reached) return;
      await tx
        .update(schema.milestones)
        .set({ state: 'reached', plannedChapter: chapter, reachedChapter: chapter, boundRevision: target.draftRevision, updatedAt: new Date() })
        .where(and(eq(schema.milestones.projectId, projectId), eq(schema.milestones.milestoneKey, change.milestoneKey), ne(schema.milestones.state, 'reached')));
      return;
    case 'summary':
      return;
  }
}

export interface ChangeApplier {
  touched(item: KeptItem): Promise<RowRef[]>;
  apply(item: KeptItem): Promise<void>;
}

/** Applies each kept item and records every row it changed as it was before and after, in order, so the set can be undone as one unit. */
export async function applyKeptItems(store: RowStore, applier: ChangeApplier, items: readonly KeptItem[]): Promise<FinalizeReviewAppliedItem[]> {
  const applied: FinalizeReviewAppliedItem[] = [];
  for (const item of items) {
    const refsBefore = await applier.touched(item);
    const before = new Map<string, StoredRow | null>();
    for (const ref of refsBefore) before.set(JSON.stringify(ref), await store.read(ref));
    await applier.apply(item);
    const refs = new Map([...refsBefore, ...(await applier.touched(item))].map(ref => [JSON.stringify(ref), ref]));
    const changes: FinalizeReviewRowChange[] = [];
    for (const [key, ref] of refs) {
      const after = await store.read(ref);
      const prior = before.get(key) ?? null;
      if (!sameRow(prior, after)) changes.push({ table: ref.table, match: ref.match, before: prior, after });
    }
    applied.push({ itemId: String(item.id), changes });
  }
  return applied;
}

/** Puts every row the kept set changed back as it was, newest first; refuses the whole undo when anything has changed those rows since. */
export async function revertAppliedItems(store: RowStore, applied: readonly FinalizeReviewAppliedItem[]): Promise<void> {
  for (const item of [...applied].reverse()) {
    for (const change of [...item.changes].reverse()) {
      const ref: RowRef = { table: change.table as RowRef['table'], match: change.match };
      const current = await store.read(ref);
      if (!sameRow(current, change.after)) throw AppErrorCode.FRV_007.create({ table: change.table });
      // The rows this set logged against a created entity are already restored by now; anything still pointing at it came later.
      if (ref.table === 'entities' && change.before === null && current && (await store.entityReferenced(current))) throw AppErrorCode.FRV_007.create({ table: change.table });
      await store.write(ref, change.before);
    }
  }
}

export function dbChangeApplier(tx: PrimaryTransaction, target: ApplyTarget): ChangeApplier {
  return {
    touched: item => rowsTouchedBy(tx, target, effectiveChange(item)),
    apply: item => applyChange(tx, target, effectiveChange(item)),
  };
}
