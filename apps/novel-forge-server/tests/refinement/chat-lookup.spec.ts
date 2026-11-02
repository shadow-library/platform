import { describe, expect, it } from 'bun:test';

import { z } from 'zod';

import { schema } from '@server/database';

import { ChatLookupService } from '@modules/refinement/chat-lookup.service';
import { TurnTraceCollector } from '@modules/refinement/chat-turn-trace';

function lookupService() {
  const writes: { table: unknown; rows: Record<string, unknown>[] }[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: async (rows: Record<string, unknown> | Record<string, unknown>[]) => void writes.push({ table, rows: Array.isArray(rows) ? rows : [rows] }),
    }),
  };
  const getNotes = {
    name: 'get_notes',
    description: 'Reads the notes.',
    inputSchema: z.object({ query: z.string().optional() }),
    handler: async ({ query }: { query?: string }) => `notes on ${query ?? 'everything'}`,
    tokensBudget: 0,
    maxCallsPerRun: 2,
  };
  const service = new ChatLookupService({ getPostgresClient: () => db } as never, { getRaw: () => [getNotes] } as never, {} as never);
  return { service, writes };
}

const observers = () => ({ round: 0, relay: null, trace: new TurnTraceCollector(), planner: { read: false }, webMode: 'off' as const });

describe('ChatLookupService.executeLookups', () => {
  it('should audit a round’s lookups in one write, a row per lookup in the order they ran', async () => {
    const { service, writes } = lookupService();
    const lookups = [
      { tool: 'get_notes', args: { query: 'ledger' } },
      { tool: 'get_notes', args: { query: 'stairs' } },
      { tool: 'get_notes', args: { query: 'dawn' } },
      { tool: 'get_map' },
    ];

    const results = await service.executeLookups(1n, 'run-1', lookups, new Map(), observers());

    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe(schema.toolCalls);
    expect(writes[0]?.rows.map(row => [row['tool'], row['status'], row['runId']])).toEqual([
      ['get_notes', 'ok', 'run-1'],
      ['get_notes', 'ok', 'run-1'],
      ['get_notes', 'budget_exceeded', 'run-1'],
      ['get_map', 'invalid_args', 'run-1'],
    ]);
    expect(results).toContain('### get_notes\nnotes on stairs');
  });

  it('should write no audit for a round with nothing to look up', async () => {
    const { service, writes } = lookupService();

    await service.executeLookups(1n, 'run-1', [], new Map(), observers());

    expect(writes).toEqual([]);
  });
});
