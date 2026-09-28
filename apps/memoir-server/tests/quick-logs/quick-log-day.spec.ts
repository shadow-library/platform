import '@server/bootstrap';

import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type CommandBus, type CommandHandler, type HeroLedger } from '@modules/commands';
import {
  type JournalRepository,
  type MealPresetRepository,
  type MealRepository,
  QuickLogsCommandsService,
  type SideQuestRepository,
  type WeightRepository,
} from '@modules/quick-logs';
import { type DatabaseTransaction } from '@server/database';
import { type TelemetryService } from '@server/telemetry';

const ACCOUNT_ID = 1n;
const ZONE_DAY = '2026-03-10';
const OPEN_DAY = '2026-03-11';

async function logSideQuestOn(date: string, lastHpDate: string): Promise<Record<string, unknown>> {
  const handlers = new Map<string, CommandHandler>();
  const commandBus = { registerHandler: (type: string, handler: CommandHandler) => handlers.set(type, handler) } as unknown as CommandBus;
  const heroLedger = { grant: async () => [{ status: 'applied', xpDelta: 5, coinsDelta: 1 }] } as unknown as HeroLedger;
  const sideQuests = { countRewardedOn: async () => 0, create: async () => ({ id: 'side-1' }), countInRange: async () => 0 } as unknown as SideQuestRepository;
  const telemetry = { emit: () => undefined } as unknown as TelemetryService;
  new QuickLogsCommandsService(
    commandBus,
    heroLedger,
    {} as JournalRepository,
    {} as MealRepository,
    {} as MealPresetRepository,
    {} as WeightRepository,
    sideQuests,
    telemetry,
  ).onModuleInit();

  const tx = { select: () => ({ from: () => ({ where: async () => [{ timezone: 'UTC', lastHpDate }] }) }) } as unknown as DatabaseTransaction;
  const outcome = await handlers.get('sidequest.log')?.({
    accountId: ACCOUNT_ID,
    tx,
    envelope: { commandId: 'c-1', type: 'sidequest.log', payload: { id: 'side-1', draft: { date, name: 'Stretch' } }, localDate: date },
  });
  return outcome?.result ?? {};
}

describe('QuickLogsCommandsService day', () => {
  afterEach(() => setSystemTime());

  it('should reward a log dated on the open day a backward timezone change left ahead of the zone', async () => {
    setSystemTime(new Date(`${ZONE_DAY}T20:00:00Z`));

    expect((await logSideQuestOn(OPEN_DAY, OPEN_DAY))['rewarded']).toBe(true);
    expect((await logSideQuestOn(ZONE_DAY, OPEN_DAY))['rewarded']).toBe(false);
  });

  it('should reward a log dated on the zone day in the ordinary case', async () => {
    setSystemTime(new Date(`${ZONE_DAY}T20:00:00Z`));

    expect((await logSideQuestOn(ZONE_DAY, ZONE_DAY))['rewarded']).toBe(true);
  });
});
