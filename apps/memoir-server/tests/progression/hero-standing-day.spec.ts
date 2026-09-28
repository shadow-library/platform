import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type HeroStandingRepository, HeroStandingService } from '@modules/progression';
import { type Account, type DailyState } from '@server/database';

const ZONE_DAY = '2026-03-10';
const OPEN_DAY = '2026-03-11';

function standingOver(days: Partial<DailyState.Row>[], lastHpDate: string) {
  const repository = {
    listShieldHolders: async () => [],
    listDailyStates: async (_accountId: bigint, from: string, to: string) => days.filter(day => (day.date as string) >= from && (day.date as string) <= to),
    hasPendingRecovery: async () => false,
  } as unknown as HeroStandingRepository;
  const account = { id: 1n, timezone: 'UTC', intensityMode: 'standard', level: 1, totalXp: 0n, lastHpDate } as Account.Row;
  return new HeroStandingService(repository).forAccount(account);
}

describe('HeroStandingService day', () => {
  afterEach(() => setSystemTime());

  it('should read the persona and Comeback of the open day a backward timezone change left ahead of the zone', async () => {
    setSystemTime(new Date(`${ZONE_DAY}T20:00:00Z`));
    const days = [
      { date: ZONE_DAY, crownPeriodStart: ZONE_DAY, returnerActive: false, comebackArmed: false, comebackFired: false, crownXpGranted: 0, crownXpRemaining: 0 },
      { date: OPEN_DAY, crownPeriodStart: OPEN_DAY, returnerActive: true, comebackArmed: true, comebackFired: false, crownXpGranted: 0, crownXpRemaining: 0 },
    ];

    const standing = await standingOver(days, OPEN_DAY);

    expect(standing.persona).toBe('returner');
    expect(standing.comeback).toEqual({ armed: true, firedOn: null });
    expect(standing.crown.periodStart).toBe(OPEN_DAY);
  });
});
