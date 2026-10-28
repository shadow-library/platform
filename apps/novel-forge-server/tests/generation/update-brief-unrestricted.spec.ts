import { describe, expect, it } from 'bun:test';

import { BriefService } from '@modules/generation/brief.service';

type Row = Record<string, unknown>;

const PLAN_LOCKED = new Error('the update reached the plan lock');

function makeService(stored: Row | undefined, unrestrictedAvailable: boolean): { service: BriefService; asked: () => number } {
  let asked = 0;
  const db = {
    query: { briefs: { findFirst: async () => stored } },
    transaction: async () => Promise.reject(PLAN_LOCKED),
  };
  const catalog = {
    unrestrictedAvailable: async () => {
      asked++;
      return unrestrictedAvailable;
    },
  };
  return { service: new BriefService({ getPostgresClient: () => db } as never, catalog as never), asked: () => asked };
}

describe('BriefService.updateBrief — unrestricted availability', () => {
  it('should refuse raising a plan to unrestricted before taking the plan lock while the catalog does not route it', async () => {
    await expect(makeService({ contentMode: 'standard' }, false).service.updateBrief(7n, 4, { body: 'The keeper climbs.', contentMode: 'unrestricted' })).rejects.toMatchObject({
      code: 'AI_024',
    });
    await expect(makeService(undefined, false).service.updateBrief(7n, 4, { body: 'The keeper climbs.', contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });
  });

  it('should raise a plan to unrestricted while the catalog routes it', async () => {
    await expect(makeService({ contentMode: null }, true).service.updateBrief(7n, 4, { body: 'The keeper climbs.', contentMode: 'unrestricted' })).rejects.toBe(PLAN_LOCKED);
  });

  it('should let a plan already unrestricted keep its mode, and never ask for any other mode', async () => {
    const kept = makeService({ contentMode: 'unrestricted' }, false);
    await expect(kept.service.updateBrief(7n, 4, { body: 'The keeper climbs.', contentMode: 'unrestricted' })).rejects.toBe(PLAN_LOCKED);
    expect(kept.asked()).toBe(0);

    const standard = makeService({ contentMode: 'unrestricted' }, false);
    await expect(standard.service.updateBrief(7n, 4, { body: 'The keeper climbs.', contentMode: 'standard' })).rejects.toBe(PLAN_LOCKED);
    expect(standard.asked()).toBe(0);
  });
});
