import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { getCharacterTimelineTool } from '@modules/ai/tools/tools/get-character-timeline.tool';
import { type ToolContext } from '@modules/ai/tools/types';

import { render } from '../generation/generation-fixtures';

interface FindManyCall {
  where: SQL;
  orderBy: SQL[];
  limit: number;
}

function makeCtx(entity: { id: bigint; name: string } | undefined, events: Record<string, unknown>[]) {
  const calls: FindManyCall[] = [];
  const ctx: ToolContext = {
    chapter: 1,
    db: {
      query: {
        entities: { findFirst: mock(async () => entity) },
        characterEvents: {
          findMany: mock(async (config: FindManyCall) => {
            calls.push(config);
            return events;
          }),
        },
      },
    } as never,
    node: 'chat-hub',
    projectId: BigInt(7),
    retrieval: { searchLore: mock(async () => []), searchProse: mock(async () => []) } as never,
    runId: 'test-run',
  };
  return { calls, ctx };
}

describe('get_character_timeline handler', () => {
  it('should degrade gracefully when the entity is unknown', async () => {
    const { ctx } = makeCtx(undefined, []);

    const result = await getCharacterTimelineTool.handler({ entityKey: 'ghost' }, ctx);

    expect(result).toBe('Entity not found: ghost');
  });

  it('should report no changes for a known entity with no events', async () => {
    const { ctx } = makeCtx({ id: 41n, name: 'Mira' }, []);

    const result = await getCharacterTimelineTool.handler({ entityKey: 'mira' }, ctx);

    expect(result).toBe('No recorded changes for Mira yet.');
  });

  it('should exclude appearance events, order newest chapter first, and cap the count', async () => {
    const { calls, ctx } = makeCtx({ id: 41n, name: 'Mira' }, []);

    await getCharacterTimelineTool.handler({ entityKey: 'mira' }, ctx);

    expect(calls[0]?.limit).toBe(20);
    expect(render(calls[0]?.where)).toMatchObject({
      sql: '("character_events"."project_id" = $1 and "character_events"."entity_id" = $2 and "character_events"."kind" <> $3)',
      params: [7n, 41n, 'appearance'],
    });
    expect(calls[0]?.orderBy.map(order => render(order).sql)).toEqual(['"character_events"."chapter" desc', '"character_events"."created_at" desc']);
  });

  it('should list every event in the order the query returned, marking a provisional one as pending finalize', async () => {
    const { ctx } = makeCtx({ id: 41n, name: 'Mira' }, [
      { chapter: 5, kind: 'relationship', after: { targetKey: 'oren', note: 'allies' }, status: 'provisional' },
      { chapter: 3, kind: 'state', after: { location: 'the tower' }, status: 'committed' },
    ]);

    const result = await getCharacterTimelineTool.handler({ entityKey: 'mira' }, ctx);

    expect(result).toContain('How Mira has changed');
    expect(result).toContain('ch 5 [relationship] (pending finalize)');
    expect(result).toContain('ch 3 [state]');
    expect(result).toContain('the tower');
  });
});
