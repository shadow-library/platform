import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

import { type CatalogSelection } from '@modules/ai/novel-forge-catalog.service';
import { ChatService, type SessionModelUpdate } from '@modules/refinement/chat.service';

type Row = Record<string, unknown>;

const OFFERED: Record<string, string[]> = { standard: ['opus', 'grok'], unrestricted: ['grok'] };

interface Harness {
  service: ChatService;
  writes: Row[];
  checked: { alias: string; selection: CatalogSelection }[];
}

function harness(session: Row = {}): Harness {
  const stored: Row = { id: 's1', projectId: 1n, contentMode: null, costTier: null, modelProvider: null, modelId: null, aliasKey: null, ...session };
  const writes: Row[] = [];
  const checked: Harness['checked'] = [];
  const db = {
    query: {
      chatSessions: { findFirst: async () => stored },
      projects: { findFirst: async () => ({ contentMode: 'standard', costTier: 'balanced' }) },
    },
    update: () => ({
      set: (set: Row) => ({
        where: () => ({
          returning: async () => {
            writes.push(set);
            return [{ ...stored, ...set }];
          },
        }),
      }),
    }),
  };
  const catalog = {
    requireChatAlias: async (alias: string, selection: CatalogSelection) => {
      checked.push({ alias, selection });
      if (!OFFERED[selection.contentMode]?.includes(alias)) throw AppErrorCode.AI_022.create({ alias });
      return { key: alias };
    },
  };
  const none = {} as never;
  const service = new ChatService({ getPostgresClient: () => db } as never, none, none, none, none, none, none, none, none, none, none, none, none, none, catalog as never);
  return { service, writes, checked };
}

const pin = (h: Harness, update: SessionModelUpdate) => h.service.updateSessionModel(1n, 's1', update);

describe('ChatService.updateSessionModel', () => {
  it('should store an offered alias as the pin and clear the registry slug pin beside it', async () => {
    const h = harness({ modelProvider: 'openrouter', modelId: 'anthropic/claude-opus-5', aliasKey: 'opus' });

    const updated = await pin(h, { provider: 'synapse', model: 'grok' });

    expect(h.writes[0]).toMatchObject({ aliasKey: 'grok', modelProvider: null, modelId: null });
    expect(updated.aliasKey).toBe('grok');
    expect(h.checked).toEqual([{ alias: 'grok', selection: { contentMode: 'standard', costTier: 'balanced' } }]);
  });

  it('should refuse an alias the catalog does not offer, writing nothing', async () => {
    const h = harness();

    await expect(pin(h, { provider: 'synapse', model: 'claude' })).rejects.toMatchObject({ code: 'AI_022' });
    expect(h.writes).toEqual([]);
  });

  it('should judge the alias under the model type and cost tier the chat will have after the update', async () => {
    const unrestricted = harness();
    await expect(pin(unrestricted, { provider: 'synapse', model: 'opus', contentMode: 'unrestricted', costTier: 'economy' })).rejects.toMatchObject({ code: 'AI_022' });
    expect(unrestricted.checked[0]?.selection).toEqual({ contentMode: 'unrestricted', costTier: 'economy' });

    const cleared = harness({ contentMode: 'unrestricted' });
    await pin(cleared, { provider: 'synapse', model: 'opus', contentMode: null });
    expect(cleared.checked[0]?.selection).toEqual({ contentMode: 'standard', costTier: 'balanced' });
  });

  it('should refuse a registry pick or a half-named pin as AI_002', async () => {
    for (const update of [{ provider: 'openrouter', model: 'anthropic/claude-opus-5' }, { provider: 'synapse' }, { model: 'opus' }]) {
      await expect(pin(harness(), update)).rejects.toMatchObject({ code: 'AI_002' });
    }
  });

  it('should clear the alias and the registry slug pin together, so the alias backfill cannot bring the slug back', async () => {
    const h = harness({ modelProvider: 'openrouter', modelId: 'anthropic/claude-opus-5', aliasKey: 'opus' });

    await pin(h, { provider: null, model: null });

    expect(h.writes[0]).toMatchObject({ aliasKey: null, modelProvider: null, modelId: null });
    expect(h.checked).toEqual([]);
  });

  it('should change only the selection when no pin field is sent', async () => {
    const h = harness({ aliasKey: 'opus' });

    await pin(h, { costTier: 'performant' });

    expect(h.writes[0]).toEqual({ updatedAt: expect.any(Date), costTier: 'performant' });
  });
});
