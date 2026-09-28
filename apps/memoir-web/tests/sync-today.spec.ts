import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type DeltaPage } from '@/lib/sync';

import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const NOW = new Date('2026-08-24T12:00:00Z');
const BROWSER_DAY = '2026-08-24';
const ACCOUNT_DAY = '2026-08-25';

function accountPage(timezone: string): DeltaPage {
  const quest = { id: 'q1', name: 'Walk', durationMin: 20, startTimeMin: 420, strictness: 'routine', recurrence: { frequency: 'daily' }, active: true };
  return { cursor: '1', hasMore: false, domains: { account: [{ id: 'account', timezone }], quests: [quest] }, tombstones: [] };
}

describe('SyncEngine today', () => {
  afterEach(() => setSystemTime());

  it('should read today in the account timezone, not the browser one', () =>
    withTimeZone('America/Los_Angeles', async () => {
      setSystemTime(NOW);
      const { engine } = createTestEngine({ today: null, pages: [accountPage('Pacific/Kiritimati')] });

      await engine.start();

      expect(engine.today).toBe(ACCOUNT_DAY);
      expect(engine.world().today).toBe(ACCOUNT_DAY);
      expect(createSyncedTestData(engine).today).toBe(ACCOUNT_DAY);
    }));

  it('should stamp a quest completion with the account day', () =>
    withTimeZone('America/Los_Angeles', async () => {
      setSystemTime(NOW);
      const posted: string[] = [];
      const { engine } = createTestEngine({
        today: null,
        pages: [accountPage('Pacific/Kiritimati')],
        fetchImpl: server => (input, init) => {
          if (String(input).includes('/sync/commands')) {
            const body = JSON.parse(String(init?.body)) as { commands: { localDate: string }[] };
            posted.push(...body.commands.map(command => command.localDate));
          }
          return server.fetchImpl(input, init);
        },
      });
      await engine.start();
      const data = createSyncedTestData(engine);

      await data.provider.dispatchCommand({ type: 'quest.complete', occurrenceId: `q1:${ACCOUNT_DAY}` });
      await engine.sync();

      expect(posted).toEqual([ACCOUNT_DAY]);
    }));

  it('should fall back to the browser day until the account is mirrored', () =>
    withTimeZone('America/Los_Angeles', () => {
      setSystemTime(new Date('2026-08-24T20:00:00Z'));
      const { engine } = createTestEngine({ today: null });

      expect(engine.today).toBe(BROWSER_DAY);
    }));
});
