import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { applyContinuityDelta } from '@modules/ai/graphs/apply-continuity';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { schema } from '@server/database';

import { render } from '../generation/generation-fixtures';

interface Write {
  table: unknown;
  kind: 'insert' | 'upsert';
  values: Record<string, unknown>;
  target?: unknown[];
  set?: Record<string, unknown>;
}

interface Entity {
  id: bigint;
  entityKey: string;
}

interface Fixture {
  entities?: Entity[];
  existingState?: Record<string, unknown>;
  existingRelationship?: Record<string, unknown>;
  appearanceAlreadyExists?: boolean;
}

const EMPTY_DELTA: ContinuityOutput = {
  appeared: [],
  newEntities: [],
  threads: [],
  mysteries: [],
  relationships: [],
  power: [],
  characterStates: [],
  knowledgeChanges: [],
  timeline: [],
  chapterSummary: 'Nothing much happened.',
};

function fakeTx(fixture: Fixture) {
  const writes: Write[] = [];
  const relationshipQueries: { where: SQL; orderBy: SQL[] }[] = [];
  const entityKeyFrom = (where: SQL) => render(where).params[1] as string;

  const tx = {
    query: {
      entities: { findFirst: async (cfg: { where: SQL }) => fixture.entities?.find(e => e.entityKey === entityKeyFrom(cfg.where)) },
      entityRelationships: {
        findFirst: async (cfg: { where: SQL; orderBy: SQL[] }) => {
          relationshipQueries.push(cfg);
          return fixture.existingRelationship;
        },
      },
      plotThreads: { findFirst: async () => undefined },
      mysteries: { findFirst: async () => undefined },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => (fixture.existingState ? [fixture.existingState] : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const write: Write = { table, kind: 'insert', values };
        writes.push(write);
        return {
          onConflictDoNothing: () => ({ returning: async () => (table === schema.entityAppearances && fixture.appearanceAlreadyExists ? [] : [{ id: 901n, ...values }]) }),
          onConflictDoUpdate: (config: { target: unknown[]; set: Record<string, unknown> }) => {
            write.kind = 'upsert';
            write.target = config.target;
            write.set = config.set;
            return { returning: async () => [{ id: 901n, ...values }] };
          },
        };
      },
    }),
  };
  return { tx, writes, relationshipQueries, eventWrites: () => writes.filter(w => w.table === schema.characterEvents) };
}

describe('applyContinuityDelta — character_events', () => {
  it("should record a 'state' event with the prior state as before and the reported state as after", async () => {
    const { tx, eventWrites } = fakeTx({
      entities: [{ id: 41n, entityKey: 'mira' }],
      existingState: { location: 'the harbour', conditions: ['tired'], immediateGoal: 'find the lamp', statusNote: null },
    });

    await applyContinuityDelta(tx as never, 7n, 5, {
      ...EMPTY_DELTA,
      characterStates: [{ entityKey: 'mira', location: 'the tower', conditions: [], statusNote: 'resolved', evidence: 'She stands atop the tower now, unburdened.' }],
    });

    const [event] = eventWrites();
    expect(event?.values).toMatchObject({
      projectId: 7n,
      entityId: 41n,
      chapter: 5,
      kind: 'state',
      detailKey: '',
      before: { location: 'the harbour', conditions: ['tired'], immediateGoal: 'find the lamp', statusNote: null },
      after: { location: 'the tower', conditions: [], immediateGoal: null, statusNote: 'resolved' },
      source: 'continuity',
      status: 'committed',
    });
  });

  it("should record a null-before 'state' event the first time a character's state is reported", async () => {
    const { tx, eventWrites } = fakeTx({ entities: [{ id: 41n, entityKey: 'mira' }] });

    await applyContinuityDelta(tx as never, 7n, 3, {
      ...EMPTY_DELTA,
      characterStates: [{ entityKey: 'mira', location: 'the tower', evidence: 'She climbs the tower for the first time.' }],
    });

    expect(eventWrites()[0]?.values).toMatchObject({ before: null, after: { location: 'the tower', conditions: null, immediateGoal: null, statusNote: null } });
  });

  it("should skip a 'state' event for a low-confidence report, matching the state row it also skips", async () => {
    const { tx, eventWrites } = fakeTx({ entities: [{ id: 41n, entityKey: 'mira' }] });

    await applyContinuityDelta(tx as never, 7n, 3, {
      ...EMPTY_DELTA,
      characterStates: [{ entityKey: 'mira', location: 'the tower', confidence: 'low', evidence: 'Perhaps she is on the tower.' }],
    });

    expect(eventWrites()).toEqual([]);
  });

  it('should keep before and refresh only after and source when a continuity re-apply hits the same event', async () => {
    const { tx, writes } = fakeTx({ entities: [{ id: 41n, entityKey: 'mira' }], existingState: { location: 'the harbour' } });

    await applyContinuityDelta(tx as never, 7n, 5, {
      ...EMPTY_DELTA,
      characterStates: [{ entityKey: 'mira', location: 'the tower', evidence: 'She stands atop the tower now.' }],
    });

    const event = writes.find(w => w.table === schema.characterEvents);
    expect(event?.kind).toBe('upsert');
    expect(event?.set).toEqual({ after: expect.anything(), source: 'continuity' });
    expect(event?.set).not.toHaveProperty('before');
  });

  it("should record an 'appearance' event only for an entity newly seen this chapter, not one already recorded", async () => {
    const { tx, eventWrites } = fakeTx({
      entities: [
        { id: 41n, entityKey: 'mira' },
        { id: 42n, entityKey: 'oren' },
      ],
    });

    await applyContinuityDelta(tx as never, 7n, 5, { ...EMPTY_DELTA, appeared: ['mira', 'oren'] });

    expect(eventWrites()).toHaveLength(2);
    expect(eventWrites().map(w => w.values['entityId'])).toEqual([41n, 42n]);
    expect(eventWrites()[0]?.values).toMatchObject({ kind: 'appearance', detailKey: '', before: null, after: null });
  });

  it('should record no appearance event when the appearance row already existed (insert conflicted)', async () => {
    const { tx, eventWrites } = fakeTx({ entities: [{ id: 41n, entityKey: 'mira' }], appearanceAlreadyExists: true });

    await applyContinuityDelta(tx as never, 7n, 5, { ...EMPTY_DELTA, appeared: ['mira'] });

    expect(eventWrites()).toEqual([]);
  });

  it("should record a 'relationship' event keyed by target and kind, with the prior note as before", async () => {
    const { tx, eventWrites } = fakeTx({
      entities: [
        { id: 41n, entityKey: 'mira' },
        { id: 42n, entityKey: 'oren' },
      ],
      existingRelationship: { note: 'wary allies' },
    });

    await applyContinuityDelta(tx as never, 7n, 6, {
      ...EMPTY_DELTA,
      relationships: [{ entityKey: 'mira', targetKey: 'oren', kind: 'ally', note: 'trusted allies', evidence: 'They shake hands as allies.' }],
    });

    expect(eventWrites()[0]?.values).toMatchObject({
      entityId: 41n,
      kind: 'relationship',
      detailKey: 'oren:ally',
      before: { targetKey: 'oren', kind: 'ally', note: 'wary allies' },
      after: { targetKey: 'oren', kind: 'ally', note: 'trusted allies' },
    });
  });

  it("should read the relationship's before from an earlier or undated chapter, newest first, never this chapter's own row", async () => {
    const { tx, relationshipQueries } = fakeTx({
      entities: [
        { id: 41n, entityKey: 'mira' },
        { id: 42n, entityKey: 'oren' },
      ],
      existingRelationship: { note: 'wary allies' },
    });

    await applyContinuityDelta(tx as never, 7n, 6, {
      ...EMPTY_DELTA,
      relationships: [{ entityKey: 'mira', targetKey: 'oren', kind: 'ally', note: 'trusted allies', evidence: 'They shake hands as allies.' }],
    });

    expect(render(relationshipQueries[0]?.where)).toMatchObject({
      sql:
        '("entity_relationships"."project_id" = $1 and "entity_relationships"."entity_id" = $2 and "entity_relationships"."target_key" = $3 ' +
        'and "entity_relationships"."kind" = $4 and ("entity_relationships"."chapter" is null or "entity_relationships"."chapter" < $5))',
      params: [7n, 41n, 'oren', 'ally', 6],
    });
    expect(relationshipQueries[0]?.orderBy.map(order => render(order).sql)).toEqual(['"entity_relationships"."chapter" desc nulls last']);
  });

  it('should record no relationship event when the source or target entity cannot be resolved', async () => {
    const { tx, eventWrites } = fakeTx({ entities: [{ id: 41n, entityKey: 'mira' }] });

    await applyContinuityDelta(tx as never, 7n, 6, {
      ...EMPTY_DELTA,
      relationships: [{ entityKey: 'mira', targetKey: 'ghost', kind: 'ally', note: 'trusted', evidence: 'She trusts the ghost.' }],
    });

    expect(eventWrites()).toEqual([]);
  });
});
