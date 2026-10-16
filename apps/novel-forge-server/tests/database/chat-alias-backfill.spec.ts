import { describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { LEGACY_SLUG_ALIAS } from '@shadow-library/synapse';

import { backfillChatAliasKeys, type BackfillDatabase, slugsByAlias } from '@server/database/chat-alias-backfill';

import { compileWhere } from '../sql-filter';

type Row = Record<string, unknown>;

function sessions(rows: Row[]): { db: BackfillDatabase; rows: Row[] } {
  const db = {
    update: () => ({
      set: (values: Row) => ({
        where: (where: SQL) => ({
          returning: async () => {
            const matches = compileWhere(where);
            const hit = rows.filter(row => matches(row));
            for (const row of hit) Object.assign(row, values);
            return hit.map(row => ({ id: row['id'] }));
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as BackfillDatabase, rows };
}

const row = (id: string, modelId: string | null, aliasKey: string | null = null): Row => ({ id, modelProvider: modelId && 'openrouter', modelId, aliasKey, updatedAt: 'kept' });

describe('backfillChatAliasKeys', () => {
  it('should give every chat pinned to a known slug the alias that slug maps to', async () => {
    const { db, rows } = sessions([row('a', 'anthropic/claude-opus-5'), row('b', 'anthropic/claude-opus-5.5'), row('c', 'z-ai/glm-5.3'), row('d', 'openai/gpt-5.6-sol')]);

    expect(await backfillChatAliasKeys(db)).toBe(4);
    expect(rows.map(entry => entry['aliasKey'])).toEqual(['opus', 'opus', 'glm', 'gpt-sol']);
  });

  it('should leave a matching alias, an alias pin with no slug, an unpinned chat and an unknown slug alone, and the chat list order with them', async () => {
    const { db, rows } = sessions([row('a', 'anthropic/claude-opus-5', 'opus'), row('b', null, 'grok'), row('c', null), row('d', 'x-ai/grok-4.1')]);

    expect(await backfillChatAliasKeys(db)).toBe(0);
    expect(rows.map(entry => entry['aliasKey'])).toEqual(['opus', 'grok', null, null]);
    expect(rows.every(entry => entry['updatedAt'] === 'kept')).toBe(true);
  });

  it('should correct a pin an older pod retargeted between two runs, which moved the slug and left the alias behind', async () => {
    const { db, rows } = sessions([row('a', 'anthropic/claude-opus-5')]);
    await backfillChatAliasKeys(db);
    Object.assign(rows[0] as Row, { modelId: 'openai/gpt-5.6-sol' });

    expect(await backfillChatAliasKeys(db)).toBe(1);
    expect(rows[0]).toMatchObject({ modelId: 'openai/gpt-5.6-sol', aliasKey: 'gpt-sol' });
  });

  it('should keep the alias of a pin an older pod cleared, the accepted rollout residual', async () => {
    const { db, rows } = sessions([row('a', 'anthropic/claude-opus-5')]);
    await backfillChatAliasKeys(db);
    Object.assign(rows[0] as Row, { modelProvider: null, modelId: null });

    expect(await backfillChatAliasKeys(db)).toBe(0);
    expect(rows[0]).toMatchObject({ modelId: null, aliasKey: 'opus' });
  });

  it('should change nothing when it runs again', async () => {
    const { db, rows } = sessions([row('a', 'moonshotai/kimi-k2.6'), row('b', 'x-ai/grok-4.3')]);

    await backfillChatAliasKeys(db);
    const once = structuredClone(rows);

    expect(await backfillChatAliasKeys(db)).toBe(0);
    expect(rows).toEqual(once);
  });

  it('should cover every slug the map knows, one statement per alias', () => {
    const grouped = slugsByAlias();

    expect([...grouped.values()].flat().sort()).toEqual(Object.keys(LEGACY_SLUG_ALIAS).sort());
    expect(grouped.get('opus')).toEqual(['anthropic/claude-opus-5.5', 'anthropic/claude-opus-5']);
  });
});
