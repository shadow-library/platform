import { describe, expect, it } from 'bun:test';

import { serializeDeltaRow } from '@modules/sync';

describe('serializeDeltaRow', () => {
  it('should carry a bigint array column, such as daily_states.locked_quest_ids, as strings the wire can serialize', () => {
    const row = serializeDeltaRow({ accountId: 1n, lockedQuestIds: [10n, 11n], rolloverAt: null });

    expect(row).toEqual({ accountId: '1', lockedQuestIds: ['10', '11'], rolloverAt: null });
    expect(() => JSON.stringify(row)).not.toThrow();
  });

  it('should resolve bigints and dates nested inside objects and arrays', () => {
    const at = new Date('2026-03-10T08:00:00Z');

    const row = serializeDeltaRow({ meta: { ids: [1n], at, label: 'x', count: 2 } });

    expect(row).toEqual({ meta: { ids: ['1'], at: '2026-03-10T08:00:00.000Z', label: 'x', count: 2 } });
  });

  it('should keep top-level scalars as they were', () => {
    const at = new Date('2026-03-10T08:00:00Z');

    expect(serializeDeltaRow({ id: 5n, at, name: 'Walk', done: false })).toEqual({ id: '5', at: '2026-03-10T08:00:00.000Z', name: 'Walk', done: false });
  });
});
